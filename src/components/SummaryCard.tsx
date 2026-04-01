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
    agreement: "Model Agreement",
    newDiscussion: "New Discussion",
    copy: "Copy",
    copied: "Copied",
    strongRec: "Strong Recommendation",
    recommended: "Recommended",
    narrowEdge: "Narrow Edge",
    noSignificantDissent: "No significant dissent",
  },
  ko: {
    verdict: "최종 판결",
    recommendation: "추천",
    voteSplit: "투표 결과",
    confidence: "확신도",
    reasons: "주요 이유",
    minorityView: "소수 의견",
    oppositeCase: "반대가 나을 때",
    agreement: "모델 일치도",
    newDiscussion: "새 토론",
    copy: "복사",
    copied: "복사됨",
    strongRec: "강력 추천",
    recommended: "추천",
    narrowEdge: "근소한 차이",
    noSignificantDissent: "유의미한 반대 없음",
  },
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
      ...(result.modelAgreement != null ? [`${t.agreement}: ${result.modelAgreement}%`] : []),
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

      {/* Header */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-100 dark:border-white/[0.06]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full border border-success-border bg-success-bg text-[10px] font-bold uppercase tracking-[0.14em] text-success">
            {t.verdict}
          </div>
          <h2 className="text-xl sm:text-[1.7rem] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{t.recommendation}</h2>
          <p className="text-sm mt-1.5 font-semibold text-success">{getStatusText(result.confidence)}</p>
        </div>
        <div className="text-right">
          <div className="text-3xl sm:text-4xl font-mono font-normal tracking-[-0.05em] text-zinc-900 dark:text-zinc-100 dark:drop-shadow-[0_0_22px_rgba(255,255,255,0.1)]">
            {result.confidence}
            <span className="text-xl sm:text-2xl">%</span>
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{t.confidence}</div>
        </div>
      </div>

      <div className="relative space-y-8">
        {/* Recommendation hero */}
        <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] bg-zinc-50/90 dark:bg-white/[0.03] px-4 py-3.5">
          <p className="text-lg sm:text-xl leading-relaxed font-semibold text-zinc-900 dark:text-zinc-100">
            {result.recommendedAnswer}
          </p>
        </div>

        {/* Vote Split */}
        <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.04] bg-zinc-50 dark:bg-white/[0.03]">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0">{t.voteSplit}</span>
          <span className="text-sm text-zinc-700 dark:text-zinc-200 leading-snug">{result.voteSplit}</span>
        </div>

        {/* Key Reasons */}
        {result.reasons.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-success flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {t.reasons}
            </h3>
            <div className="space-y-1.5">
              {result.reasons.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.04] bg-zinc-50 dark:bg-white/[0.03] text-sm text-zinc-700 dark:text-zinc-100 leading-snug">
                  <span className="text-success mt-0.5 text-lg leading-none shrink-0">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Minority View */}
        {result.minorityView && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-warning flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              {t.minorityView}
            </h3>
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.04] bg-zinc-50 dark:bg-white/[0.03] text-sm text-zinc-700 dark:text-zinc-100 leading-snug">
              <span className="text-warning mt-0.5 text-lg leading-none shrink-0">•</span>
              <span>{result.minorityView}</span>
            </div>
          </div>
        )}

        {/* Opposite Case */}
        {result.oppositeCase && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.04] bg-zinc-50 dark:bg-white/[0.03]">
            <Info className="w-4 h-4 text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-snug">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">{t.oppositeCase}:</span>{" "}
              {result.oppositeCase}
            </p>
          </div>
        )}

        {/* Model Agreement footnote */}
        {result.modelAgreement != null && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-600 text-center">
            {t.agreement}: {result.modelAgreement}%
          </p>
        )}

        {/* Action buttons */}
        <div className="pt-8 border-t border-zinc-100 dark:border-white/[0.04] flex justify-center gap-3">
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
