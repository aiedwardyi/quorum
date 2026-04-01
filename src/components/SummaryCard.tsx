"use client"

import { useState } from "react"
import { VerdictResult, Locale } from "@/types"
import { motion } from "framer-motion"
import { CheckCircle2, AlertTriangle, Info, RefreshCw, Copy, Check } from "lucide-react"

const translations = {
  en: {
    verdict: "Final Verdict",
    recommendation: "Recommendation",
    voteSplit: "Vote Split",
    confidence: "Confidence",
    reasons: "Key Reasons",
    minorityView: "Minority View",
    oppositeCase: "Consider the opposite when",
    newDiscussion: "New Discussion",
    copy: "Copy",
    copied: "Copied",
    strongRec: "Strong Recommendation",
    recommended: "Recommended",
    narrowEdge: "Narrow Edge",
  },
  ko: {
    verdict: "최종 판결",
    recommendation: "추천",
    voteSplit: "투표 결과",
    confidence: "확신도",
    reasons: "주요 이유",
    minorityView: "소수 의견",
    oppositeCase: "반대가 나을 때",
    newDiscussion: "새 토론",
    copy: "복사",
    copied: "복사됨",
    strongRec: "강력 추천",
    recommended: "추천",
    narrowEdge: "근소한 차이",
  },
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 80) return { text: "text-success", bg: "bg-success", border: "border-success/30" }
  if (confidence >= 60) return { text: "text-warning", bg: "bg-warning", border: "border-warning/30" }
  return { text: "text-danger", bg: "bg-danger", border: "border-danger/30" }
}

export default function SummaryCard({
  result,
  onNewDiscussion,
  locale,
}: {
  result: VerdictResult
  onNewDiscussion: () => void
  locale: Locale
}) {
  const t = translations[locale]
  const [copied, setCopied] = useState(false)
  const colors = getConfidenceColor(result.confidence)

  const getStatusText = (confidence: number) => {
    if (confidence >= 80) return t.strongRec
    if (confidence >= 60) return t.recommended
    return t.narrowEdge
  }

  const handleCopy = () => {
    const text = [
      t.recommendation,
      result.recommendedAnswer,
      "",
      `${t.voteSplit}: ${result.voteSplit}`,
      `${t.confidence}: ${result.confidence}%`,
      "",
      `${t.reasons}:`,
      ...result.reasons.map((r) => `  - ${r}`),
      "",
      `${t.minorityView}: ${result.minorityView}`,
      `${t.oppositeCase}: ${result.oppositeCase}`,
    ].join("\n")
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="relative overflow-hidden w-full max-w-3xl mx-auto mt-8 mb-12 rounded-[28px] border border-zinc-200/80 dark:border-white/[0.08] bg-white dark:bg-[linear-gradient(180deg,#121317_0%,#0c0d10_100%)] p-6 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_18px_50px_rgba(0,0,0,0.34)]"
    >
      <div className="pointer-events-none absolute inset-0 hidden dark:block bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.12),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.08),transparent_26%)]" />

      {/* Header - verdict badge + confidence pills */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-5 border-b border-zinc-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-success-border bg-success-bg text-[10px] font-bold uppercase tracking-[0.14em] text-success">
            {t.verdict}
          </div>
          <span className={`text-xs font-semibold ${colors.text}`}>{getStatusText(result.confidence)}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Vote split badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50 dark:bg-white/[0.04] text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            {result.voteSplit}
          </div>
          {/* Confidence badge */}
          <div className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border ${colors.border} bg-zinc-50 dark:bg-white/[0.04]`}>
            <div className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
            <span className={`text-xs font-bold font-mono ${colors.text}`}>{result.confidence}%</span>
          </div>
        </div>
      </div>

      <div className="relative space-y-6">
        {/* THE ANSWER - hero text */}
        <div className={`rounded-2xl border-l-4 ${colors.border} bg-zinc-50/90 dark:bg-white/[0.04] px-5 py-4`}>
          <p className="text-xl sm:text-2xl leading-snug font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            {result.recommendedAnswer}
          </p>
        </div>

        {/* Key Reasons */}
        {result.reasons.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.reasons}
            </h3>
            <div className="space-y-1">
              {result.reasons.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm text-zinc-700 dark:text-zinc-200 leading-snug">
                  <span className="text-success mt-0.5 text-sm leading-none shrink-0">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Minority View */}
        {result.minorityView && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t.minorityView}
            </h3>
            <div className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-300 leading-snug">
              <span className="text-warning mt-0.5 text-sm leading-none shrink-0">•</span>
              <span>{result.minorityView}</span>
            </div>
          </div>
        )}

        {/* Opposite Case */}
        {result.oppositeCase && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/60 dark:border-white/[0.04] bg-zinc-50/50 dark:bg-white/[0.02]">
            <Info className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              <span className="font-semibold">{t.oppositeCase}:</span>{" "}
              {result.oppositeCase}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="pt-6 border-t border-zinc-100 dark:border-white/[0.04] flex justify-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onNewDiscussion}
            className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-sm font-medium rounded-xl transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t.newDiscussion}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            className="flex items-center gap-2 px-5 py-2.5 bg-transparent border border-zinc-200 dark:border-white/[0.08] hover:bg-zinc-50 dark:hover:bg-white/[0.04] text-zinc-500 dark:text-zinc-400 text-sm font-medium rounded-xl transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t.copied : t.copy}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
