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
    analysis: "Analysis",
    keyTakeaways: "Key Takeaways",
    actionItems: "Next Steps",
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
    analysis: "분석",
    keyTakeaways: "핵심 요약",
    actionItems: "다음 단계",
  },
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 60) return { text: "text-theme-accent", bg: "bg-theme-accent", border: "border-theme-accent/30" }
  if (confidence >= 40) return { text: "text-theme-accent-light", bg: "bg-theme-accent-light", border: "border-theme-accent-light/30" }
  return { text: "text-danger", bg: "bg-danger", border: "border-danger/30" }
}

export default function SummaryCard({
  result,
  onNewDiscussion,
  locale,
  inline = false,
}: {
  result: VerdictResult
  onNewDiscussion?: () => void
  locale: Locale
  inline?: boolean
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
    const lines = [
      t.recommendation,
      result.recommendedAnswer,
      "",
      `${t.voteSplit}: ${result.voteSplit}`,
      `${t.confidence}: ${result.confidence}%`,
    ]
    if (result.analysis) {
      lines.push("", `${t.analysis}:`, result.analysis)
    }
    lines.push("", `${t.reasons}:`, ...result.reasons.map((r) => `  - ${r}`))
    if (result.keyTakeaways && result.keyTakeaways.length > 0) {
      lines.push("", `${t.keyTakeaways}:`, ...result.keyTakeaways.map((r) => `  - ${r}`))
    }
    if (result.actionItems && result.actionItems.length > 0) {
      lines.push("", `${t.actionItems}:`, ...result.actionItems.map((r, i) => `  ${i + 1}. ${r}`))
    }
    lines.push("", `${t.minorityView}: ${result.minorityView}`, `${t.oppositeCase}: ${result.oppositeCase}`)
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="relative overflow-hidden w-full max-w-3xl mx-auto mt-8 mb-12 rounded-[28px] p-6 sm:p-8"
      style={{
        background: 'var(--summary-card-bg)',
        border: '1px solid var(--summary-card-border)',
        boxShadow: 'var(--summary-card-shadow)',
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--summary-card-overlay)' }} />

      {/* Header - verdict badge + confidence pills */}
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-5" style={{ borderBottom: '1px solid var(--summary-callout-border)' }}>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-theme-accent-border bg-theme-accent-bg text-[10px] font-bold uppercase tracking-[0.14em] text-theme-accent">
            {t.verdict}
          </div>
          <span className={`text-xs font-semibold ${colors.text}`}>{getStatusText(result.confidence)}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Vote split badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ border: '1px solid var(--summary-callout-border)', background: 'var(--summary-callout-bg)', color: 'var(--summary-secondary-text)' }}>
            {result.voteSplit}
          </div>
          {/* Confidence badge */}
          <div className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border ${colors.border}`} style={{ background: 'var(--summary-callout-bg)' }}>
            <div className={`w-1.5 h-1.5 rounded-full ${colors.bg}`} />
            <span className={`text-xs font-bold font-mono ${colors.text}`}>{result.confidence}%</span>
          </div>
        </div>
      </div>

      <div className="relative space-y-6">
        {/* THE ANSWER - hero text */}
        <div className={`rounded-2xl border-l-4 ${colors.border} px-5 py-4`} style={{ background: 'var(--summary-callout-bg)' }}>
          <p className="text-xl sm:text-2xl leading-snug font-bold tracking-tight" style={{ color: 'var(--summary-main-text)' }}>
            {result.recommendedAnswer}
          </p>
        </div>

        {/* Analysis */}
        {result.analysis && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {t.analysis}
            </h3>
            <p className="px-3.5 py-2 text-sm leading-relaxed" style={{ color: 'var(--summary-secondary-text)' }}>
              {result.analysis}
            </p>
          </div>
        )}

        {/* Key Reasons */}
        {result.reasons.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.reasons}
            </h3>
            <div className="space-y-1">
              {result.reasons.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm leading-snug" style={{ color: 'var(--summary-secondary-text)' }}>
                  <span className="text-theme-accent mt-0.5 text-sm leading-none shrink-0">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Takeaways */}
        {result.keyTakeaways && result.keyTakeaways.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.keyTakeaways}
            </h3>
            <div className="space-y-1">
              {result.keyTakeaways.map((item, i) => {
                const dashIdx = item.indexOf(" - ")
                const hasLabel = dashIdx > 0 && dashIdx < 40
                return (
                  <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm leading-snug" style={{ color: 'var(--summary-secondary-text)' }}>
                    <span className="text-theme-accent mt-0.5 text-sm leading-none shrink-0">•</span>
                    <span>
                      {hasLabel ? (
                        <>
                          <strong style={{ color: 'var(--summary-main-text)' }}>{item.slice(0, dashIdx)}</strong>
                          {item.slice(dashIdx)}
                        </>
                      ) : item}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Minority View */}
        {result.minorityView && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--summary-muted-text)' }}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {t.minorityView}
            </h3>
            <div className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm leading-snug" style={{ color: 'var(--summary-secondary-text)' }}>
              <span className="mt-0.5 text-sm leading-none shrink-0" style={{ color: 'var(--summary-muted-text)' }}>•</span>
              <span>{result.minorityView}</span>
            </div>
          </div>
        )}

        {/* Action Items */}
        {result.actionItems && result.actionItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.actionItems}
            </h3>
            <div className="space-y-1">
              {result.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm leading-snug" style={{ color: 'var(--summary-secondary-text)' }}>
                  <span className="text-theme-accent mt-0.5 text-xs font-bold leading-none shrink-0">{i + 1}.</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opposite Case */}
        {result.oppositeCase && (
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl" style={{ border: '1px solid var(--summary-row-border)', background: 'var(--summary-row-bg)' }}>
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--summary-muted-text)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--summary-muted-text)' }}>
              <span className="font-semibold">{t.oppositeCase}:</span>{" "}
              {result.oppositeCase}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="pt-6 flex justify-center gap-3" style={{ borderTop: '1px solid var(--summary-callout-border)' }}>
          {onNewDiscussion && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onNewDiscussion}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl transition-colors shadow-sm"
              style={{ background: 'var(--user-bubble)', color: 'var(--user-bubble-foreground)' }}
            >
              <RefreshCw className="w-4 h-4" />
              {t.newDiscussion}
            </motion.button>
          )}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            aria-label={copied ? t.copied : t.copy}
            aria-live="polite"
            className="flex items-center gap-2 px-5 py-2.5 bg-transparent text-sm font-medium rounded-xl transition-colors"
            style={{ border: '1px solid var(--summary-callout-border)', color: 'var(--summary-muted-text)' }}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t.copied : t.copy}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
