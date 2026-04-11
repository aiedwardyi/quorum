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
  activeModels,
  responseLength,
  onSendMessage,
  onNewDiscussion,
}: {
  messages: Message[]
  typingModel?: Provider | null
  isDebating?: boolean
  locale: Locale
  activeModels: Provider[]
  responseLength?: ResponseLength
  onSendMessage: (text: string) => void
  onNewDiscussion?: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

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

  useEffect(() => {
    const main = bottomRef.current?.closest("main")
    if (!main) return
    const handleScroll = () => {
      const distFromBottom = main.scrollHeight - main.scrollTop - main.clientHeight
      isNearBottom.current = distFromBottom < 150
    }
    main.addEventListener("scroll", handleScroll)
    return () => main.removeEventListener("scroll", handleScroll)
  }, [hasMessages])

  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    const userJustSent = userMessageCount > prevUserMessageCountRef.current
    prevUserMessageCountRef.current = userMessageCount
    const verdictJustAdded = lastMsg?.sender === "verdict"

    // When the final verdict card lands, scroll so the TOP of the card
    // sits at the top of the viewport - otherwise the default bottom-ref
    // scroll lands on the bottom of a tall card and the user has to
    // scroll up to read the recommendation.
    if (verdictJustAdded && lastMsg) {
      const main = bottomRef.current?.closest("main")
      const verdictEl = main?.querySelector(
        `[data-message-id="${lastMsg.id}"]`
      ) as HTMLElement | null
      if (verdictEl) {
        verdictEl.scrollIntoView({ behavior: "smooth", block: "start" })
        return
      }
    }

    // Always scroll to the bottom when the user just sent a new prompt,
    // regardless of previous scroll position. Matches standard chat
    // behavior (ChatGPT, Claude) - the user's prompt lands at the
    // bottom and the first AI bubble streams into view. Also repins
    // isNearBottom so follow-up chunks auto-scroll as they stream in.
    // Smooth behavior is fine here because it's a single one-off call.
    if (userJustSent) {
      isNearBottom.current = true
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
      return
    }

    // Otherwise only auto-scroll during streaming if the user was
    // already near the bottom; if they scrolled up to read something,
    // don't yank them back. Use behavior:"auto" here because this
    // effect fires on every streamed chunk - a smooth-scroll animation
    // started on one chunk gets interrupted by the next chunk's call
    // and, because the target keeps moving, the animation never
    // catches up. The user would see the viewport freeze in place and
    // then "snap to bottom" only after the stream fully ended (which
    // is exactly the regression we are fixing). Instant scrolls stay
    // glued to the latest content frame-by-frame.
    if (isNearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" })
    }
  }, [messages, typingModel, userMessageCount])

  if (messages.length === 0 && !typingModel) {
    return (
      <div className="w-full">
        <WelcomeHero locale={locale} activeModels={activeModels} onSuggestionClick={onSendMessage} />
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
      <div className="max-w-3xl mx-auto w-full flex flex-col">
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
