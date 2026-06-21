"use client"

import { useState, useRef, useEffect, useLayoutEffect, type ComponentProps } from "react"
import { Copy, Check } from "lucide-react"
import { Message, Provider, Locale, ResponseLength } from "@/types"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useSmoothStream } from "@/hooks/useSmoothStream"
import { SYSTEM_MESSAGES } from "@/hooks/useDebateEngine"
import { stripHeadingMarkersForPlainText, trimUnclosedTrailingMarkdown } from "@/lib/clean-response"
import VerdictSkeleton from "@/components/VerdictSkeleton"
const SummaryCard = dynamic(() => import("@/components/SummaryCard"), {
  loading: () => (
    <div className="h-48 w-full max-w-3xl mx-auto mt-8 mb-12 bg-muted rounded-[28px] animate-pulse" />
  ),
})

const mdComponents = {
  table: ({ children, ...props }: ComponentProps<"table">) => (
    <div className="table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
}

const thinkingText = { en: "is thinking...", ko: "생각 중..." }
const showLessText = { en: "Show less", ko: "접기" }
const showMoreText = { en: "...", ko: "..." }
const copyLabels = {
  en: { copy: "Copy", copied: "Copied" },
  ko: { copy: "복사", copied: "복사됨" },
}

const modelColors: Record<string, string> = {
  gemini: "text-blue-600 dark:text-blue-400",
  perplexity: "text-teal-600 dark:text-teal-400",
  claude: "text-orange-600 dark:text-orange-400",
  gpt: "text-emerald-600 dark:text-emerald-400",
  user: "text-zinc-900 dark:text-zinc-100",
}

const modelBorders: Record<string, string> = {
  gemini: "border-blue-200 dark:border-blue-900/50",
  perplexity: "border-teal-200 dark:border-teal-900/50",
  claude: "border-orange-200 dark:border-orange-900/50",
  gpt: "border-emerald-200 dark:border-emerald-900/50",
  user: "border-zinc-200 dark:border-zinc-800",
}

const dotColors: Record<string, string> = {
  gemini: "bg-blue-400",
  perplexity: "bg-teal-400",
  claude: "bg-orange-400",
  gpt: "bg-emerald-400",
}

const modelBackgrounds: Record<string, string> = {
  gemini: "bg-blue-50/50 dark:bg-blue-950/30",
  perplexity: "bg-teal-50/50 dark:bg-teal-950/30",
  claude: "bg-orange-50/50 dark:bg-orange-950/30",
  gpt: "bg-emerald-50/50 dark:bg-emerald-950/30",
  user: "bg-white dark:bg-zinc-900",
}

const ModelIcon = ({ provider, className }: { provider: Provider; className?: string }) => {
  switch (provider) {
    case "gemini":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
            fill="#3186FF"
          />
          <path
            d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
            fill="url(#cb-gem-g0)"
          />
          <path
            d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
            fill="url(#cb-gem-g1)"
          />
          <path
            d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
            fill="url(#cb-gem-g2)"
          />
          <defs>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id="cb-gem-g0"
              x1="7"
              x2="11"
              y1="15.5"
              y2="12"
            >
              <stop stopColor="#08B962" />
              <stop offset="1" stopColor="#08B962" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id="cb-gem-g1"
              x1="8"
              x2="11.5"
              y1="5.5"
              y2="11"
            >
              <stop stopColor="#F94543" />
              <stop offset="1" stopColor="#F94543" stopOpacity="0" />
            </linearGradient>
            <linearGradient
              gradientUnits="userSpaceOnUse"
              id="cb-gem-g2"
              x1="3.5"
              x2="17.5"
              y1="13.5"
              y2="12"
            >
              <stop stopColor="#FABC12" />
              <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      )
    case "claude":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path
            clipRule="evenodd"
            d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z"
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      )
    case "gpt":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.946-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1 .19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      )
    case "perplexity":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path
            d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z"
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      )
    default:
      return null
  }
}

export default function ChatBubble({
  message,
  isTyping,
  isDebating,
  forceCompleteForAnalysis,
  locale = "en",
  responseLength = "short",
  onNewDiscussion,
}: {
  message: Message
  isTyping?: boolean
  isDebating?: boolean
  /** True when the debate has entered the analyzing phase and this
   *  bubble is NOT the currently typing one. Tells the smoothed stream
   *  hook to snap instantly so the verdict skeleton card can take over
   *  without overlapping a tail-draining bubble. */
  forceCompleteForAnalysis?: boolean
  locale?: Locale
  responseLength?: ResponseLength
  onNewDiscussion?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [copied, setCopied] = useState(false)
  // Timeout id for the "Copied" flash reset. Stored in a ref so we can
  // cancel it on unmount or on a second click before the first flash
  // has finished - otherwise a setState on an unmounted component can
  // fire and React logs a warning, and a quick double-click can leave
  // two timers racing.
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current != null) {
        clearTimeout(copyResetTimerRef.current)
        copyResetTimerRef.current = null
      }
    }
  }, [])
  const isAI = !["user", "system", "verdict"].includes(message.sender)

  const handleCopy = () => {
    if (!message.content) return
    const markSuccess = () => {
      if (copyResetTimerRef.current != null) {
        clearTimeout(copyResetTimerRef.current)
      }
      setCopied(true)
      copyResetTimerRef.current = setTimeout(() => {
        copyResetTimerRef.current = null
        setCopied(false)
      }, 1500)
    }
    // Modern async Clipboard API - only available in secure contexts
    // (https, localhost) and recent browsers. Guard both the namespace
    // and writeText because navigator.clipboard can itself be undefined
    // in non-secure contexts, and accessing .writeText on undefined
    // would throw TypeError before entering the promise chain.
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(message.content)
        .then(markSuccess)
        .catch(() => {})
      return
    }
    // Legacy fallback for non-secure contexts and old browsers.
    // document.execCommand('copy') is deprecated but still widely
    // supported and is the standard escape hatch for environments
    // where the async clipboard API is blocked. Wrap the copy
    // operation in try/finally so the temporary textarea is removed
    // even if focus/select/execCommand throws - without the finally,
    // an exception after appendChild would leak the node into the DOM.
    const ta = document.createElement("textarea")
    ta.value = message.content
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.top = "0"
    ta.style.left = "0"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    try {
      ta.focus()
      ta.select()
      if (document.execCommand("copy")) markSuccess()
    } catch {
      // Give up quietly - the button just won't flash "Copied".
    } finally {
      if (ta.parentNode) ta.parentNode.removeChild(ta)
    }
  }
  // Force-complete this bubble's smoothed stream when the analyzing
  // phase has begun and this bubble is not the currently typing one.
  // The verdict skeleton card is about to render in the same region
  // and we do not want the tail drain to overlap it.
  const shouldForceComplete = isAI && !isTyping && !!forceCompleteForAnalysis
  const displayedText = useSmoothStream(
    message.content ?? "",
    !!isTyping,
    isAI ? message.sender : null,
    shouldForceComplete,
    isAI ? message.id : null
  )
  const isStillDraining = displayedText.length < (message.content?.length ?? 0)
  // "Active" = either the engine is streaming this bubble, or the smooth
  // stream is still draining post-stream chunks.
  const isActive = !!isTyping || isStillDraining
  // Debounced "content has settled" signal. Goes false instantly when
  // isActive flips true (so the caret/glow respond immediately), and only
  // flips true after isActive has been false for STABLE_DELAY_MS continuously.
  // This absorbs the inevitable micro-flickers from the engine and rAF
  // (for example: typingModel briefly null between models, or rAF momentarily
  // catching up between chunks). Without it, the collapse clamp toggles on
  // and off mid-stream.
  // Initialized true for hydrated/historical messages so they collapse on
  // first paint instead of waiting for the debounce timer.
  const STABLE_DELAY_MS = 500
  const [contentStable, setContentStable] = useState(() => !isActive)
  useEffect(() => {
    if (isActive) {
      setContentStable(false)
      return
    }
    const t = setTimeout(() => setContentStable(true), STABLE_DELAY_MS)
    return () => clearTimeout(t)
  }, [isActive])

  const showCaret = isAI && isActive
  // Arm the collapse transition only after the user has had a moment to
  // register the verdict card. Without this grace window, the collapse
  // fires the instant isDebating flips false, stealing focus from the
  // verdict and making the layout feel like it's twitching. 1.2s is long
  // enough to read "Round complete" and see the verdict's first frame.
  //
  // Once armed, collapseArmed STAYS true - never re-disarms. Otherwise
  // when the user sends a new prompt and isDebating flips true again for
  // the new debate, every historical bubble from previous sessions would
  // un-collapse, expanding the whole thread and moving the viewport.
  const POST_DEBATE_GRACE_MS = 1200
  const [collapseArmed, setCollapseArmed] = useState(() => !isDebating)
  useEffect(() => {
    if (isDebating) return
    if (collapseArmed) return
    const t = setTimeout(() => setCollapseArmed(true), POST_DEBATE_GRACE_MS)
    return () => clearTimeout(t)
  }, [isDebating, collapseArmed])
  // Track "has this bubble been collapsed at least once". Once true, the
  // bubble remains collapsed even if isDebating flips true again for a
  // subsequent debate session - historical responses stay condensed and
  // only the new debate's bubbles are fully expanded.
  const [hasBeenCollapsed, setHasBeenCollapsed] = useState(false)
  const baseShouldCollapse =
    isAI && responseLength !== "short" && contentStable && !isDebating && collapseArmed && !expanded
  useEffect(() => {
    // Intentional imperative sync: once the bubble meets the collapse
    // criteria even once, remember it so it stays collapsed across
    // later debate sessions.
    if (baseShouldCollapse) setHasBeenCollapsed(true)
  }, [baseShouldCollapse])
  // The final collapse gate: either the normal conditions hold, OR this
  // bubble has been collapsed before (sticky). `expanded` (user clicked
  // "Show more") always wins.
  const shouldCollapse =
    isAI && responseLength !== "short" && !expanded && (baseShouldCollapse || hasBeenCollapsed)

  // Measure overflow once the bubble's content has been stable long enough
  // that we can trust it isn't about to grow again. Also gated on !isDebating
  // so the measurement runs only after the entire debate ends, avoiding
  // mid-debate re-measures triggered by adjacent bubbles' state changes.
  useLayoutEffect(() => {
    if (!contentStable || isDebating || !isAI || responseLength === "short") return
    if (!contentRef.current || !message.content) return
    const el = contentRef.current
    // Temporarily strip any wrapping maxHeight so we read the natural
    // unclamped height. We turn the transition off first so the snap-back
    // doesn't animate visibly.
    const prevMax = el.style.maxHeight
    const prevOverflow = el.style.overflow
    const prevTransition = el.style.transition
    el.style.transition = "none"
    el.style.maxHeight = "none"
    el.style.overflow = "visible"
    const naturalHeight = el.scrollHeight
    el.style.maxHeight = prevMax
    el.style.overflow = prevOverflow
    // Force a reflow before restoring the transition so the snap-back
    // doesn't animate visibly.
    void el.offsetHeight
    el.style.transition = prevTransition
    // 6em at the bubble's 15px font ≈ 90px. Add a small buffer for padding.
    // Anything taller than ~5 lines (around 110px including padding) overflows.
    const COLLAPSED_PX = 110
    const overflows = naturalHeight > COLLAPSED_PX
    setIsOverflowing((o) => (o === overflows ? o : overflows))
  }, [message.content, contentStable, isDebating, isAI, responseLength])

  if (message.sender === "system") {
    // Empty-content system messages are used as a "cleared" sentinel by
    // the debate engine when a prior analyzing divider needs to be
    // removed after the verdict arrives. Don't render them.
    if (!message.content) return null

    // Match against SYSTEM_MESSAGES.analyzing for both locales so the
    // canonical copy in useDebateEngine is the single source of truth.
    const isAnalyzing =
      message.content === SYSTEM_MESSAGES.analyzing("en") ||
      message.content === SYSTEM_MESSAGES.analyzing("ko")

    return (
      <>
        <div className="my-6 flex w-full items-center gap-3 animate-bubble-in">
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400",
              isAnalyzing && "animate-pulse"
            )}
          >
            {message.content}
          </span>
          <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
        {isAnalyzing && <VerdictSkeleton locale={locale} />}
      </>
    )
  }

  if (message.sender === "verdict" && message.verdictData) {
    return (
      <div className="w-full" data-message-id={message.id}>
        <SummaryCard
          result={message.verdictData}
          locale={locale}
          inline
          onNewDiscussion={onNewDiscussion}
        />
      </div>
    )
  }

  const isUser = message.sender === "user"
  const isEmpty = !isUser && !message.content

  // The copy button is rendered on every non-empty user/AI bubble once
  // the content has settled (not during live streaming). System
  // dividers and verdict cards are skipped - the verdict has its own
  // copy surface in SummaryCard, and system dividers have no copyable
  // content.
  const showCopyButton = !isEmpty && !isActive && !!message.content
  const copyText = copyLabels[locale]

  return (
    <div
      className={cn(
        "group flex w-full mb-4 animate-bubble-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex flex-col min-w-0 max-w-[85%] sm:max-w-[75%]",
          isUser ? "items-end" : "items-start"
        )}
      >
        <div className="flex items-center gap-2 mb-1.5 px-1">
          {!isUser && (
            <span
              className={cn(
                "icon-holder",
                modelColors[message.sender] ?? "text-zinc-500",
                // Keep the speak-glow ring on while the bubble is
                // visibly active - either the network stream is open
                // (isTyping) or the smoothed stream is still draining
                // the post-stream buffer (isStillDraining). Gating on
                // isTyping alone made the ring disappear the instant
                // the network closed, even though the caret was still
                // typing through the buffered tail.
                isActive && "speaking"
              )}
              data-provider={message.sender}
            >
              <span className="ring" aria-hidden="true" />
              <ModelIcon provider={message.sender as Provider} />
            </span>
          )}
          <span
            className={cn(
              "text-xs font-medium tracking-tight",
              modelColors[message.sender] ?? "text-zinc-500"
            )}
          >
            {message.displayName}
          </span>
          {!isEmpty && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>

        {isEmpty ? (
          <div
            key="thinking"
            className={cn(
              "px-4 py-3 rounded-2xl rounded-tl-sm border shadow-sm flex items-center gap-2",
              modelBorders[message.sender] ?? "border-zinc-200 dark:border-zinc-800",
              modelBackgrounds[message.sender] ?? "bg-zinc-50 dark:bg-zinc-900/50"
            )}
          >
            <div className="flex gap-1">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full animate-bounce",
                  dotColors[message.sender] ?? "bg-zinc-400"
                )}
                style={{ animationDelay: "0ms" }}
              />
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full animate-bounce",
                  dotColors[message.sender] ?? "bg-zinc-400"
                )}
                style={{ animationDelay: "150ms" }}
              />
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full animate-bounce",
                  dotColors[message.sender] ?? "bg-zinc-400"
                )}
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <span
              className={cn("text-xs font-medium", modelColors[message.sender] ?? "text-zinc-500")}
            >
              {thinkingText[locale]}
            </span>
          </div>
        ) : (
          <div className="relative">
            <div
              key="content"
              ref={isAI ? contentRef : undefined}
              className={cn(
                "px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed shadow-sm break-words transition-all duration-200",
                isUser
                  ? "bg-[var(--user-bubble)] text-[var(--user-bubble-foreground)] rounded-tr-sm whitespace-pre-wrap"
                  : cn(
                      "border rounded-tl-sm text-zinc-800 dark:text-zinc-200 chat-markdown",
                      modelBorders[message.sender] ?? "border-zinc-200 dark:border-zinc-800",
                      modelBackgrounds[message.sender] ?? "bg-zinc-50 dark:bg-zinc-900/50"
                    )
              )}
              style={
                shouldCollapse
                  ? {
                      maxHeight: "6em",
                      overflow: "hidden",
                      transition: "max-height 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
                    }
                  : isAI && responseLength !== "short"
                    ? {
                        maxHeight: "9999px",
                        transition:
                          isTyping || isStillDraining
                            ? "none"
                            : "max-height 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
                      }
                    : undefined
              }
            >
              {isUser ? (
                message.content
              ) : isActive ? (
                // While the bubble is streaming or still draining the
                // smoothed buffer, render plain text instead of
                // ReactMarkdown. displayedText changes every frame
                // during streaming; ReactMarkdown's GFM parser was
                // fast enough in isolation, but in practice the layout
                // cost of rebuilding the markdown tree delayed rAF
                // callbacks below the smooth-stream tick rate. Once
                // the rAF loop fell behind the stream buffer grew, the
                // tick code caught up by flushing larger character
                // counts per frame, and the user saw that as visibly
                // chunky bursts instead of continuous typing. The
                // non-monotonic bubble height from the bursty render
                // also broke auto-scroll follow. Plain text here keeps
                // the typing smooth; ReactMarkdown takes over the
                // instant isActive flips false at settle.
                <div className="whitespace-pre-wrap">
                  {stripHeadingMarkersForPlainText(trimUnclosedTrailingMarkdown(displayedText))}
                </div>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                  {displayedText}
                </ReactMarkdown>
              )}
              {showCaret && <span className="speak-caret" aria-hidden="true" />}
            </div>
            {shouldCollapse && isOverflowing && (
              <button
                type="button"
                className="absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl flex items-end justify-center pb-1 cursor-pointer"
                style={{
                  background: "linear-gradient(transparent, var(--background))",
                }}
                onClick={() => setExpanded(true)}
                aria-label={locale === "ko" ? "더 보기" : "Show more"}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                  {showMoreText[locale]}
                </span>
              </button>
            )}
          </div>
        )}
        {(showCopyButton || (isAI && expanded && isOverflowing && responseLength !== "short")) && (
          // Unified actions row below the bubble. Show less (when
          // expanded) and Copy live side by side so the layout stays
          // tidy whether the bubble is collapsed or expanded. Both
          // buttons share the same ghost-style, muted-until-hover
          // treatment to feel like a group.
          <div
            className={cn(
              "mt-1.5 flex items-center gap-1",
              isUser ? "justify-end" : "justify-start"
            )}
          >
            {isAI && expanded && isOverflowing && responseLength !== "short" && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex items-center px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all duration-150 cursor-pointer opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
              >
                {showLessText[locale]}
              </button>
            )}
            {showCopyButton && (
              <button
                type="button"
                onClick={handleCopy}
                aria-label={copied ? copyText.copied : copyText.copy}
                title={copied ? copyText.copied : copyText.copy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all duration-150 cursor-pointer opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? copyText.copied : copyText.copy}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
