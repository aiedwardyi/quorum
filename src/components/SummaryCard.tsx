"use client"

import { useState } from "react"
import { ConsensusResult, Locale } from "@/types"
import { motion } from "framer-motion"
import { CheckCircle2, XCircle, RefreshCw, Copy, Check } from "lucide-react"

const translations = {
  en: {
    summary: "Discussion Summary",
    agreements: "Agreements",
    disagreements: "Disagreements",
    newDiscussion: "New Discussion",
    copy: "Copy",
    copied: "Copied",
    verdict: "Final Verdict",
    alignment: "Alignment",
    consensus: "Consensus",
  },
  ko: {
    summary: "토론 요약",
    agreements: "합의 사항",
    disagreements: "의견 차이",
    newDiscussion: "새 토론",
    copy: "복사",
    copied: "복사됨",
    verdict: "최종 합의",
    alignment: "정렬도",
    consensus: "합의",
  },
}

export default function SummaryCard({
  result,
  onNewDiscussion,
  locale,
}: {
  result: ConsensusResult
  onNewDiscussion: () => void
  locale: Locale
}) {
  const t = translations[locale]
  const [copied, setCopied] = useState(false)

  const getStatusText = (s: number) => {
    if (s >= 80) return locale === "ko" ? "합의 도달" : "Consensus Reached"
    return locale === "ko" ? "토론 완료" : "Discussion Concluded"
  }

  const handleCopy = () => {
    const text = [
      `${t.summary} - ${result.score}%`,
      "",
      result.summary,
      "",
      ...(result.agreements.length > 0 ? [`${t.agreements}:`, ...result.agreements.map((a) => `  - ${a}`)] : []),
      ...(result.disagreements.length > 0 ? ["", `${t.disagreements}:`, ...result.disagreements.map((d) => `  - ${d}`)] : []),
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

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-100 dark:border-white/[0.06]">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-3 rounded-full border border-emerald-200 bg-emerald-50 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            {t.verdict}
          </div>
          <h2 className="text-xl sm:text-[1.7rem] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{t.summary}</h2>
          <p className="text-sm mt-1.5 font-semibold text-green-600 dark:text-green-400">{getStatusText(result.score)}</p>
        </div>
        <div className="text-right">
          <div className="text-5xl sm:text-6xl font-mono font-normal tracking-[-0.05em] text-zinc-900 dark:text-zinc-100 dark:drop-shadow-[0_0_22px_rgba(255,255,255,0.1)]">
            {result.score}
            <span className="text-3xl sm:text-4xl">%</span>
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">{t.alignment}</div>
        </div>
      </div>

      <div className="relative space-y-8">
        <div className="rounded-2xl border border-zinc-200/80 dark:border-white/[0.05] bg-zinc-50/90 dark:bg-white/[0.03] px-4 py-3.5">
          <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-200">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{t.consensus}:</span>{" "}
            {result.summary}
          </p>
        </div>

        {result.agreements.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {t.agreements}
            </h3>
            <div className="space-y-1.5">
              {result.agreements.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.04] bg-zinc-50 dark:bg-white/[0.03] text-sm text-zinc-700 dark:text-zinc-100 leading-snug">
                  <span className="text-emerald-500 dark:text-emerald-400 mt-0.5 text-lg leading-none shrink-0">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.disagreements.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-500 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              {t.disagreements}
            </h3>
            <div className="space-y-1.5">
              {result.disagreements.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-zinc-200/80 dark:border-white/[0.04] bg-zinc-50 dark:bg-white/[0.03] text-sm text-zinc-700 dark:text-zinc-100 leading-snug">
                  <span className="text-red-500 dark:text-red-400 mt-0.5 text-lg leading-none shrink-0">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
