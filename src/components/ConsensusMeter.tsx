"use client"

import { useEffect, useState } from "react"
import { VerdictResult, Locale } from "@/types"
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

  const [displayScore, setDisplayScore] = useState(0)

  useEffect(() => {
    const target = score ?? 0
    if (target === displayScore) return

    const step = target > displayScore ? 1 : -1
    const timer = setInterval(() => {
      setDisplayScore((prev) => {
        const next = prev + step
        if ((step > 0 && next >= target) || (step < 0 && next <= target)) {
          clearInterval(timer)
          return target
        }
        return next
      })
    }, 16)
    return () => clearInterval(timer)
  }, [score]) // eslint-disable-line react-hooks/exhaustive-deps

  const getColor = (s: number) => {
    if (s >= 60) return "bg-theme-accent shadow-[0_0_15px_var(--theme-accent-glow)]"
    if (s >= 40) return "bg-theme-accent-light/50 shadow-[0_0_10px_var(--theme-accent-glow)]"
    return "bg-danger shadow-[0_0_15px_var(--danger-bg)]"
  }

  const getTextColor = (s: number) => {
    if (s >= 60) return "text-theme-accent"
    if (s >= 40) return "text-theme-accent-light"
    return "text-danger"
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 mb-3 animate-bubble-in">
      <div className="space-y-2">
        <div className="flex items-center justify-between" aria-live="polite">
          <div className="flex items-center gap-2 group/label relative cursor-help">
            <div className="relative">
              {result ? (
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    score !== null && score >= 60
                      ? "bg-theme-accent"
                      : score !== null && score >= 40
                      ? "bg-theme-accent-light"
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
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em] transition-colors", isFinal ? "text-theme-accent" : "text-zinc-500 dark:text-zinc-400")}>
              {result ? t.verdict : t.confidence}
            </span>
            <div className="absolute bottom-full left-0 mb-2 px-2 py-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-medium rounded opacity-0 group-hover/label:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-sm">
              {t.tooltip}
            </div>
          </div>

          {score !== null ? (
            <div
              className={cn("flex items-center text-sm font-mono font-bold tracking-tight transition-colors duration-500", getTextColor(score), isFinal && "drop-shadow-[0_0_8px_var(--theme-accent-glow)]")}
            >
              <span>{displayScore}</span>
              <span className="text-xs ml-0.5">%</span>
            </div>
          ) : (
            <span className="text-[10px] font-mono font-medium text-zinc-400 dark:text-zinc-600 tracking-widest animate-pulse">
              {t.analyzing}
            </span>
          )}
        </div>

        <div className={cn("h-1.5 w-full rounded-full overflow-hidden transition-colors duration-500 bg-muted", isFinal && "ring-1 ring-border")}>
          {score !== null && (
            <div
              className={cn("h-full rounded-full transition-all duration-700 ease-out", getColor(score))}
              style={{ width: `${displayScore}%` }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
