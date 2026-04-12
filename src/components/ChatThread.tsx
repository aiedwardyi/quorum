"use client"

import { useEffect, useMemo, useRef } from "react"
import { Message, Provider, Locale, ResponseLength } from "@/types"
import ChatBubble from "@/components/ChatBubble"
import WelcomeHero from "@/components/WelcomeHero"
import { SYSTEM_MESSAGES } from "@/hooks/useDebateEngine"

export default function ChatThread({
  messages,
  typingModel,
  isDebating,
  locale,
  responseLength,
  onSendMessage,
  onNewDiscussion,
}: {
  messages: Message[]
  typingModel?: Provider | null
  isDebating?: boolean
  locale: Locale
  responseLength?: ResponseLength
  onSendMessage: (text: string) => void
  onNewDiscussion?: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  // When true, the ResizeObserver follow-scroll yields to the verdict
  // scroll logic so it doesn't chase the SummaryCard to the bottom.
  const verdictScrollActiveRef = useRef(false)

  const hasMessages = messages.length > 0 || !!typingModel

  // Count user messages so we can detect "user just sent a new prompt".
  // We cannot rely on checking `messages[last].sender === 'user'` inside
  // the scroll effect because the debate engine dispatches the user
  // message AND the first AI placeholder synchronously, React batches
  // them, and by the time the effect runs the last sender is the AI
  // placeholder. Counting user messages and comparing against the
  // previous count survives that batch and is the real signal.
  const userMessageCount = useMemo(
    () => messages.reduce((n, m) => (m.sender === "user" ? n + 1 : n), 0),
    [messages]
  )
  const prevUserMessageCountRef = useRef(userMessageCount)

  // Follow-scroll during content growth. The previous implementation
  // piggybacked on the chunk-rate `messages` effect below, calling
  // scrollIntoView on every new chunk. That worked when chunks arrived
  // faster than the smooth-stream could drain them, but the moment the
  // smooth-stream buffer filled up (turbo drain, late-in-response, GPT
  // bursts) the hook started advancing many chars per frame BETWEEN
  // chunks, and those frames never triggered a React re-render on
  // ChatThread - only ChatBubble re-rendered from its internal
  // useSmoothStream state. Result: the bubble visibly grew past the
  // viewport bottom with no scroll follow, then snapped back to the
  // bottom at the next chunk or when the response settled. Users saw
  // "scroll follows for the first half, then loses track, then jumps
  // to the bottom at the end".
  //
  // ResizeObserver sidesteps that by firing on every layout change of
  // the content container - including the line-wraps produced by the
  // smooth-stream drain between chunks. It self-gates on distance
  // from the bottom BEFORE the growth: if the user was already near
  // the bottom we follow; if they scrolled up to re-read something,
  // the distance exceeds the 150px threshold and we leave them alone.
  //
  // Scroll implementation: we set `main.style.scrollBehavior = "auto"`
  // once at observer install and then use plain `main.scrollTop =
  // main.scrollHeight` on every fire. Two reasons we avoid
  // `scrollTo({ behavior: "instant" })`:
  //  1) `"instant"` is non-standard in older WebIDL enum enforcement -
  //     some runtimes throw TypeError on invalid ScrollBehavior values.
  //  2) Plain `scrollTop` writes respect the element's scroll-behavior
  //     CSS, which is inherited as `smooth` from somewhere in the
  //     Tailwind / browser defaults stack. Without an override every
  //     scrollTop assignment would kick off a ~300ms smooth animation
  //     with a stale target, the bubble would grow more while it was
  //     chasing, and the viewport would compound the lag on every
  //     fire (the exact regression the earlier fix round had to hunt
  //     down).
  // Inline-styling main's scroll-behavior to "auto" overrides the
  // inherited CSS without touching any other element. The user-send
  // smooth scroll and verdict-card smooth scroll both call
  // scrollIntoView with an explicit `behavior: "smooth"` option, and
  // per CSSOM spec an explicit behavior overrides the element's
  // scroll-behavior - so those paths stay smooth even though the
  // container is now in auto mode.
  //
  // Tracking `content.offsetHeight` (rather than main.scrollHeight)
  // isolates the signal to the chat content - main.scrollHeight can
  // briefly shrink when the streaming plain-text bubble flips to its
  // ReactMarkdown render (paragraph margins collapse whitespace), and
  // we do not want those shrinks to reset the growth baseline.
  useEffect(() => {
    if (!hasMessages) return
    const main = bottomRef.current?.closest("main")
    const content = contentRef.current
    if (!main || !content) return
    // Override the inherited `scroll-behavior: smooth` for the lifetime
    // of this observer. Save whatever was there first so cleanup can
    // restore it if the effect ever re-runs.
    const prevScrollBehavior = main.style.scrollBehavior
    main.style.scrollBehavior = "auto"
    let prevContentH = content.offsetHeight
    const ro = new ResizeObserver(() => {
      const currContentH = content.offsetHeight
      if (currContentH <= prevContentH) {
        prevContentH = currContentH
        return
      }
      // The gate has to use the PRE-growth distance from the bottom,
      // not the post-growth one. main.scrollHeight inside this callback
      // already reflects the new layout, so a naive
      // `scrollHeight - scrollTop - clientHeight` gives us distance
      // AFTER the growth. If a single observer fire represents a large
      // growth (new bubble inserted, code block rendered, tab-resume
      // catch-up flushes multiple line wraps), the post-growth distance
      // can exceed 150 even though the user was sitting at the bottom
      // when the growth started, and the follow-scroll would wrongly
      // drop them. Subtracting the growth delta recovers the distance
      // we had before the content grew, which is what the "was the
      // user near the bottom?" check is actually asking.
      const growthDelta = currContentH - prevContentH
      prevContentH = currContentH
      const preGrowthDistFromBottom =
        main.scrollHeight - main.scrollTop - main.clientHeight - growthDelta
      if (preGrowthDistFromBottom < 150 && !verdictScrollActiveRef.current) {
        // Plain scrollTop write. The inline scroll-behavior override
        // above ensures this lands instantly rather than animating.
        main.scrollTop = main.scrollHeight
      }
    })
    ro.observe(content)
    return () => {
      ro.disconnect()
      main.style.scrollBehavior = prevScrollBehavior
    }
  }, [hasMessages])

  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    const userJustSent = userMessageCount > prevUserMessageCountRef.current
    prevUserMessageCountRef.current = userMessageCount
    const verdictJustAdded = lastMsg?.sender === "verdict"

    // When the final verdict card lands, scroll it into view.
    // On mobile the card is taller than the viewport, so scroll to the
    // TOP (block: "start"). On desktop the card fits, so scroll to
    // show the whole card (block: "end" keeps the bottom visible and
    // the top in view). SummaryCard is dynamically imported, so we
    // poll until it renders past the skeleton height and suppress the
    // ResizeObserver meanwhile.
    let timerId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    if (verdictJustAdded && lastMsg) {
      verdictScrollActiveRef.current = true
      const main = bottomRef.current?.closest("main")
      const msgId = lastMsg.id
      let attempts = 0
      const SKELETON_H = 200
      const MAX_ATTEMPTS = 40 // ~2s at 50ms intervals
      const SCROLL_SETTLE_MS = 800
      const poll = () => {
        if (cancelled) return
        const verdictEl = main?.querySelector(
          `[data-message-id="${msgId}"]`
        ) as HTMLElement | null
        if (verdictEl && verdictEl.offsetHeight > SKELETON_H) {
          const viewportH = main?.clientHeight ?? window.innerHeight
          const cardFits = verdictEl.offsetHeight <= viewportH - 40
          verdictEl.scrollIntoView({
            behavior: "smooth",
            block: cardFits ? "end" : "start",
          })
          timerId = setTimeout(() => { verdictScrollActiveRef.current = false }, SCROLL_SETTLE_MS)
          return
        }
        attempts++
        if (attempts < MAX_ATTEMPTS) {
          timerId = setTimeout(poll, 50)
        } else {
          if (verdictEl) {
            verdictEl.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          timerId = setTimeout(() => { verdictScrollActiveRef.current = false }, SCROLL_SETTLE_MS)
        }
      }
      poll()
      return () => {
        cancelled = true
        if (timerId) clearTimeout(timerId)
        verdictScrollActiveRef.current = false
      }
    }

    // User just hit send: always scroll to bottom smoothly. Matches
    // standard chat UX (ChatGPT, Claude) - the user's prompt lands at
    // the bottom and the first AI bubble streams into view from there.
    // Content-growth follow-scrolling during streaming is handled by
    // the ResizeObserver effect above, not here.
    if (userJustSent) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, userMessageCount])

  if (messages.length === 0 && !typingModel) {
    return (
      <div className="w-full">
        <WelcomeHero locale={locale} onSuggestionClick={onSendMessage} />
      </div>
    )
  }

  // Find the single message currently being streamed. We match the LAST
  // message whose sender equals typingModel, not every message with that
  // sender. Otherwise a prior round's Gemini bubble keeps showing the caret
  // (and speaking glow) when round 2 starts streaming into a new Gemini
  // bubble, because both bubbles share `sender === "gemini"`.
  let typingMessageId: string | undefined
  if (typingModel) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === typingModel) {
        typingMessageId = messages[i].id
        break
      }
    }
  }

  // Detect the "analyzing" phase: once the engine has dispatched the
  // analyzing divider (and its verdict skeleton), every AI bubble must
  // be fully rendered so the user doesn't see the last bubble still
  // visibly typing underneath the skeleton. Match against
  // SYSTEM_MESSAGES.analyzing for both locales so the copy lives in one
  // place.
  const analyzingInProgress = messages.some(
    (m) =>
      m.sender === "system" &&
      (m.content === SYSTEM_MESSAGES.analyzing("en") ||
        m.content === SYSTEM_MESSAGES.analyzing("ko"))
  )

  // A bubble should force-complete its smoothed stream only when the
  // analyzing phase has begun - the verdict skeleton card needs the
  // last bubble's tail drain out of the way to avoid overlap.
  //
  // The earlier "snap on mid-debate handoff" behavior is gone: the
  // debate engine now awaits waitForDrain(id) in drain-registry between
  // models, so the next bubble never takes over while the previous one
  // is still visibly typing. Dropping the handoff snap is what lets
  // non-Claude providers actually type through their full content.

  return (
    <div className="px-4 py-6" role="log">
      <div ref={contentRef} className="max-w-3xl mx-auto w-full flex flex-col">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            message={msg}
            isTyping={msg.id === typingMessageId}
            isDebating={isDebating}
            // Force this bubble's smoothed stream to snap to full only
            // during the analyzing phase, so the verdict skeleton can
            // take over cleanly. Mid-debate handoffs are handled by the
            // engine's waitForDrain - no force-complete needed there.
            forceCompleteForAnalysis={analyzingInProgress && msg.id !== typingMessageId}
            locale={locale}
            responseLength={responseLength}
            onNewDiscussion={onNewDiscussion}
          />
        ))}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  )
}
