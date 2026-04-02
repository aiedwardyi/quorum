"use client"

import { Message, Provider, Locale } from "@/types"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import SummaryCard from "@/components/SummaryCard"

const thinkingText = { en: "is thinking...", ko: "생각 중..." }

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
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF" />
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#cb-gem-g0)" />
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#cb-gem-g1)" />
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#cb-gem-g2)" />
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="cb-gem-g0" x1="7" x2="11" y1="15.5" y2="12"><stop stopColor="#08B962" /><stop offset="1" stopColor="#08B962" stopOpacity="0" /></linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="cb-gem-g1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stopColor="#F94543" /><stop offset="1" stopColor="#F94543" stopOpacity="0" /></linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="cb-gem-g2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stopColor="#FABC12" /><stop offset=".46" stopColor="#FABC12" stopOpacity="0" /></linearGradient>
          </defs>
        </svg>
      )
    case "claude":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="currentColor" fillRule="evenodd" />
        </svg>
      )
    case "gpt":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.946-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1 .19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" fill="currentColor" fillRule="evenodd" />
        </svg>
      )
    case "perplexity":
      return (
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className={className}>
          <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="currentColor" fillRule="evenodd" />
        </svg>
      )
    default:
      return null
  }
}

export default function ChatBubble({
  message,
  isTyping,
  locale = "en",
  onNewDiscussion,
}: {
  message: Message
  isTyping?: boolean
  locale?: Locale
  onNewDiscussion?: () => void
}) {
  if (message.sender === "system") {
    const isAnalyzing = message.content.includes("Analyzing") || message.content.includes("분석")

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-6 flex w-full items-center gap-3"
      >
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
      </motion.div>
    )
  }

  if (message.sender === "verdict" && message.verdictData) {
    // SummaryCard has its own entrance animation - no wrapper animation needed
    return (
      <div className="w-full">
        <SummaryCard result={message.verdictData} locale={locale} inline onNewDiscussion={onNewDiscussion} />
      </div>
    )
  }

  const isUser = message.sender === "user"
  const isEmpty = !isUser && !message.content

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex w-full mb-4", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("flex flex-col min-w-0 max-w-[85%] sm:max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div className="flex items-center gap-2 mb-1.5 px-1">
          {!isUser && (
            <span className={cn(modelColors[message.sender] ?? "text-zinc-500")}>
              <ModelIcon provider={message.sender as Provider} />
            </span>
          )}
          <span className={cn("text-xs font-medium tracking-tight", modelColors[message.sender] ?? "text-zinc-500")}>
            {message.displayName}
          </span>
          {!isEmpty && (
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
              {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {isEmpty ? (
          <div className={cn(
            "px-4 py-3 rounded-2xl rounded-tl-sm border shadow-sm flex items-center gap-2",
            modelBorders[message.sender] ?? "border-zinc-200 dark:border-zinc-800",
            modelBackgrounds[message.sender] ?? "bg-zinc-50 dark:bg-zinc-900/50"
          )}>
            <div className="flex gap-1">
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className={cn("w-1.5 h-1.5 rounded-full", dotColors[message.sender] ?? "bg-zinc-400")} />
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.2 }} className={cn("w-1.5 h-1.5 rounded-full", dotColors[message.sender] ?? "bg-zinc-400")} />
              <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.4 }} className={cn("w-1.5 h-1.5 rounded-full", dotColors[message.sender] ?? "bg-zinc-400")} />
            </div>
            <span className={cn("text-xs font-medium", modelColors[message.sender] ?? "text-zinc-500")}>{thinkingText[locale]}</span>
          </div>
        ) : (
          <div
            className={cn(
              "px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed shadow-sm break-words whitespace-pre-wrap transition-all duration-200",
              isUser
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-tr-sm"
                : cn(
                    "border rounded-tl-sm text-zinc-800 dark:text-zinc-200",
                    modelBorders[message.sender] ?? "border-zinc-200 dark:border-zinc-800",
                    modelBackgrounds[message.sender] ?? "bg-zinc-50 dark:bg-zinc-900/50"
                  )
            )}
          >
            {message.content}
            {isTyping && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-current"
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
