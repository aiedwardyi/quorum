"use client"

import { useEffect } from "react"
import { VerdictResult, Locale } from "@/types"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"

const translations = {
  en: {
    confidence: "Confidence",
    tooltip: "How confident the recommendation is based on model debate.",
    analyzing: "ANALYZING...",
    verdict: "VERDICT READY",
  },
  ko: {
    confidence: "확신도",
    tooltip: "모델 토론 결과에 따른 추천 확신도입니다.",
    analyzing: "분석 중...",
    verdict: "판결 완료",
  },
}

export default function ConsensusMeter({
  score,
  result,
  locale,
}: {
  score: number | null
  result: VerdictResult | null
  locale: Locale
}) {
  const t = translations[locale]
  const isFinal = !!result

  const scoreValue = useMotionValue(0)
  const springScore = useSpring(scoreValue, { stiffness: 60, damping: 15 })
  const displayScore = useTransform(springScore, (latest) => Math.round(latest))
  const barWidth = useTransform(springScore, (latest) => `${latest}%`)

  useEffect(() => {
    scoreValue.set(score ?? 0)
  }, [score, scoreValue])

  const getColor = (s: number) => {
    if (s >= 80) return "bg-success shadow-[0_0_15px_var(--success-bg)]"
    if (s >= 50) return "bg-warning shadow-[0_0_15px_var(--warning-bg)]"
    return "bg-danger shadow-[0_0_15px_var(--danger-bg)]"
  }

  const getTextColor = (s: number) => {
    if (s >= 80) return "text-success"
    if (s >= 50) return "text-warning"
    return "text-danger"
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
                      ? "bg-success"
                      : score !== null && score >= 50
                      ? "bg-warning"
                      : "bg-danger"
                  )}
                />
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-ping opacity-20" />
                </>
              )}
            </div>
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em] transition-colors", isFinal ? "text-success" : "text-zinc-500 dark:text-zinc-400")}>
              {result ? t.verdict : t.confidence}
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
              className={cn("flex items-center text-sm font-mono font-bold tracking-tight transition-colors duration-500", getTextColor(score), isFinal && "drop-shadow-[0_0_8px_rgba(16,185,129,0.25)]")}
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

        <div className={cn("h-1.5 w-full rounded-full overflow-hidden transition-colors duration-500 bg-muted", isFinal && "ring-1 ring-border")}>
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
