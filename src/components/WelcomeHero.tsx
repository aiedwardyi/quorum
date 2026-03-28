"use client"

import { motion } from "framer-motion"
import { Provider, Locale } from "@/types"
import { Sparkles, MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

const suggestions = {
  en: [
    "Should I file a provisional or non-provisional patent?",
    "Compare the pros and cons of nuclear vs. solar energy.",
    "What's the best tech stack for a real-time collaborative app?",
    "Remote vs. hybrid work: which is better for a startup?",
  ],
  ko: [
    "가특허(Provisional)와 정식 특허 중 무엇을 신청해야 할까요?",
    "원자력과 태양광 에너지의 장단점을 비교해 주세요.",
    "실시간 협업 앱을 위한 최적의 기술 스택은 무엇인가요?",
    "원격 근무 vs 하이브리드: 스타트업에 무엇이 더 좋을까요?",
  ],
}

const translations = {
  en: {
    title: "Quorum",
    subtitle: "Multi-AI group chat for consensus",
    description:
      "Ask once and let the world's best AI models talk it out. Steer the conversation and watch them converge on the best answer.",
  },
  ko: {
    title: "Quorum",
    subtitle: "합의를 위한 멀티 AI 그룹 채팅",
    description:
      "한 번만 질문하고 세계 최고의 AI 모델들이 토론하게 하세요. 대화를 주도하며 그들이 최선의 답변으로 수렴하는 과정을 지켜보세요.",
  },
}

const modelColors: Record<Provider, string> = {
  gemini: "text-blue-500",
  claude: "text-orange-500",
  gpt: "text-emerald-500",
  perplexity: "text-teal-500",
}

const ModelIcon = ({ provider, size = 14 }: { provider: Provider; size?: number }) => {
  switch (provider) {
    case "gemini":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF" />
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#wh-gem-g0)" />
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#wh-gem-g1)" />
          <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#wh-gem-g2)" />
          <defs>
            <linearGradient gradientUnits="userSpaceOnUse" id="wh-gem-g0" x1="7" x2="11" y1="15.5" y2="12"><stop stopColor="#08B962" /><stop offset="1" stopColor="#08B962" stopOpacity="0" /></linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="wh-gem-g1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stopColor="#F94543" /><stop offset="1" stopColor="#F94543" stopOpacity="0" /></linearGradient>
            <linearGradient gradientUnits="userSpaceOnUse" id="wh-gem-g2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stopColor="#FABC12" /><stop offset=".46" stopColor="#FABC12" stopOpacity="0" /></linearGradient>
          </defs>
        </svg>
      )
    case "claude":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
        </svg>
      )
    case "gpt":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-emerald-500">
          <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.946-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" fill="currentColor" fillRule="evenodd" />
        </svg>
      )
    case "perplexity":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="text-teal-500">
          <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="currentColor" fillRule="evenodd" />
        </svg>
      )
  }
}

export default function WelcomeHero({
  locale,
  onSuggestionClick,
  activeModels,
}: {
  locale: Locale
  onSuggestionClick: (text: string) => void
  activeModels: Provider[]
}) {
  const t = translations[locale]
  const s = suggestions[locale]

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="space-y-8 max-w-2xl"
      >
        <div className="space-y-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-[2.5rem] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 mb-4 shadow-2xl shadow-zinc-500/20"
          >
            <Sparkles className="w-10 h-10" />
          </motion.div>

          <div className="space-y-1">
            <h1 className="text-5xl sm:text-6xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100">
              {t.title}
            </h1>
            <p className="text-lg sm:text-xl font-medium text-zinc-400 dark:text-zinc-500">{t.subtitle}</p>
          </div>
        </div>

        <p className="text-[14px] leading-relaxed text-zinc-500 dark:text-zinc-500 max-w-lg mx-auto font-medium">
          {t.description}
        </p>

        <div className="flex flex-wrap justify-center gap-3 py-2">
          {activeModels.map((model) => (
            <div
              key={model}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-800/60 rounded-full"
            >
              <span className={modelColors[model]}>
                <ModelIcon provider={model} size={14} />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                {model === "gpt" ? "GPT" : model}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
          {s.map((suggestion, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              onClick={() => onSuggestionClick(suggestion)}
              className="flex items-center gap-4 p-4 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-left hover:border-zinc-400 dark:hover:border-zinc-600 transition-all active:scale-[0.98] group shadow-sm"
            >
              <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 line-clamp-2 leading-snug">
                {suggestion}
              </span>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
