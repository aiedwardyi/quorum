"use client"

import { useEffect, useState } from "react"
import { Locale } from "@/types"

/**
 * Placeholder verdict card shown while the final /api/consensus request
 * is in flight. Fills the vertical space the real SummaryCard will occupy
 * so the layout doesn't jump when the real verdict lands, and gives the
 * user something visibly "happening" during the wait. Pure CSS animations
 * per the project's no-framer-motion-during-streaming rule.
 */

const statusPhrases: Record<Locale, string[]> = {
  en: [
    "Comparing perspectives...",
    "Weighing the evidence...",
    "Finding common ground...",
    "Finalizing recommendation...",
  ],
  ko: ["관점 비교 중...", "근거 분석 중...", "공통점 찾는 중...", "추천 정리 중..."],
}

const PHRASE_INTERVAL_MS = 1400

export default function VerdictSkeleton({ locale = "en" }: { locale?: Locale }) {
  const phrases = statusPhrases[locale] ?? statusPhrases.en
  const [phraseIndex, setPhraseIndex] = useState(0)

  // Depend on the phrases array itself so switching locale mid-mount
  // tears down the old interval and starts a new one closed over the
  // new array. The current phraseIndex might be out of range for a
  // shorter locale until the first tick lands, which the safeIndex
  // modulo below guards against.
  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % phrases.length)
    }, PHRASE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [phrases])

  // Clamp the displayed index to the active phrases array so a locale
  // switch never renders undefined while waiting for the first tick.
  const safeIndex = phraseIndex % phrases.length

  return (
    <div
      className="w-full max-w-3xl mx-auto mt-4 mb-12 px-6 py-6 rounded-[28px] border border-zinc-200/70 dark:border-zinc-800/70 bg-gradient-to-br from-zinc-50/80 to-zinc-100/80 dark:from-zinc-900/50 dark:to-zinc-950/50 shadow-sm overflow-hidden animate-bubble-in"
      role="status"
      aria-live="polite"
      aria-label={phrases[safeIndex]}
    >
      {/* header row: label + confidence chip */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-theme-accent/70 animate-pulse" />
          <div className="h-3 w-24 rounded-full bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
        </div>
        <div className="h-6 w-20 rounded-full bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
      </div>

      {/* main recommendation line + sub-line */}
      <div className="space-y-2 mb-5">
        <div className="h-5 w-3/4 rounded-md bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
        <div className="h-5 w-1/2 rounded-md bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
      </div>

      {/* reasons / bullet rows */}
      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-3 w-5/6 rounded-md bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-3 w-4/6 rounded-md bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          <div className="h-3 w-3/5 rounded-md bg-zinc-200 dark:bg-zinc-800 verdict-skeleton-shimmer" />
        </div>
      </div>

      {/* rotating status phrase */}
      <div className="mt-4 pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-center">
        <span
          key={safeIndex}
          className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400 animate-verdict-phrase"
        >
          {phrases[safeIndex]}
        </span>
      </div>
    </div>
  )
}
