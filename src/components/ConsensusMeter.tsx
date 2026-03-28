"use client"

import { useEffect } from "react"
import { ConsensusResult, Locale } from "@/types"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"

const translations = {
  en: {
    consensus: "Consensus",
    tooltip: "Measures how much the different AI models agree with each other.",
    analyzing: "ANALYZING...",
    verdict: "FINAL VERDICT",
  },
  ko: {
    consensus: "합의",
    tooltip: "서로 다른 AI 모델들이 얼마나 일치하는지 측정합니다.",
    analyzing: "분석 중...",
    verdict: "최종 합의",
  },
}

export default function ConsensusMeter({
  score,
  result,
  locale,
  variant = "rail",
}: {
  score: number | null
  result: ConsensusResult | null
  locale: Locale
  variant?: "header" | "rail"
}) {
  const t = translations[locale]

  const scoreValue = useMotionValue(0)
  const springScore = useSpring(scoreValue, { stiffness: 60, damping: 15 })
  const displayScore = useTransform(springScore, (latest) => Math.round(latest))
  const barWidth = useTransform(springScore, (latest) => `${latest}%`)

  useEffect(() => {
    scoreValue.set(score ?? 0)
  }, [score, scoreValue])

  const getColor = (s: number) => {
    if (s >= 80) return "bg-emerald-500 dark:bg-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
    if (s >= 50) return "bg-amber-500 dark:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
    return "bg-rose-500 dark:bg-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.5)]"
  }

  const getTextColor = (s: number) => {
    if (s >= 80) return "text-emerald-600 dark:text-emerald-400"
    if (s >= 50) return "text-amber-600 dark:text-amber-400"
    return "text-rose-600 dark:text-rose-400"
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="w-full max-w-2xl mx-auto px-4 mb-3"
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 group/label relative cursor-help">
            <div className="relative">
              {result ? (
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    score !== null && score >= 80
                      ? "bg-emerald-500"
                      : score !== null && score >= 50
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  )}
                />
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-ping opacity-20" />
                </>
              )}
            </div>
            <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em]">
              {result ? t.verdict : t.consensus}
            </span>
            <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded opacity-0 group-hover/label:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm">
              {t.tooltip}
            </div>
          </div>

          {score !== null ? (
            <motion.div
              key={score}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn("flex items-center text-sm font-mono font-bold tracking-tight transition-colors duration-500", getTextColor(score))}
            >
              <motion.span>{displayScore}</motion.span>
              <span className="text-xs ml-0.5">%</span>
            </motion.div>
          ) : (
            <span className="text-[10px] font-mono font-medium text-zinc-400 dark:text-zinc-600 tracking-widest animate-pulse">
              {t.analyzing}
            </span>
          )}
        </div>

        <div className="h-1.5 w-full bg-zinc-200/50 dark:bg-zinc-800/50 rounded-full overflow-hidden">
          {score !== null && (
            <motion.div
              className={cn("h-full rounded-full transition-colors duration-500", getColor(score))}
              style={{ width: barWidth }}
            />
          )}
        </div>
      </div>
    </motion.div>
  )
}
