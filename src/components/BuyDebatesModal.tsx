"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Zap, Loader2 } from "lucide-react"
import type { Locale } from "@/types"
import { cn } from "@/lib/utils"

type DebatePackage = {
  id: string
  name: string
  debateCount: number
  priceKRW: number
  priceUSD: number
}

const translations = {
  en: {
    title: "Buy Debates",
    subtitle: "Choose a debate pack to get started",
    debates: "debates",
    popular: "Popular",
    bestValue: "Best Value",
    redirecting: "Redirecting to checkout...",
    error: "Something went wrong. Please try again.",
    loading: "Loading packages...",
  },
  ko: {
    title: "토론 구매",
    subtitle: "토론 팩을 선택하세요",
    debates: "토론",
    popular: "인기",
    bestValue: "최고 가성비",
    redirecting: "결제 페이지로 이동 중...",
    error: "오류가 발생했습니다. 다시 시도해주세요.",
    loading: "패키지 로딩 중...",
  },
}

function formatPrice(pkg: DebatePackage, locale: Locale): string {
  if (locale === "ko") {
    return `${pkg.priceKRW.toLocaleString("ko-KR")}원`
  }
  return `$${(pkg.priceUSD / 100).toFixed(2)}`
}

function getBadge(debateCount: number, locale: Locale): string | null {
  if (debateCount === 100) return translations[locale].popular
  if (debateCount === 300) return translations[locale].bestValue
  return null
}

export default function BuyDebatesModal({
  isOpen,
  onClose,
  locale,
}: {
  isOpen: boolean
  onClose: () => void
  locale: Locale
}) {
  const [packages, setPackages] = useState<DebatePackage[]>([])
  const [loadingPackages, setLoadingPackages] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = translations[locale]

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching pattern */
  useEffect(() => {
    if (!isOpen) return
    setLoadingPackages(true)
    setError(null)
    fetch("/api/debates/packages")
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((data) => { if (Array.isArray(data)) setPackages(data) })
      .catch(() => setError(t.error))
      .finally(() => setLoadingPackages(false))
  }, [isOpen, t.error])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSelect = async (pkg: DebatePackage) => {
    setRedirecting(true)
    setError(null)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.assign(data.url)
      } else {
        setError(t.error)
        setRedirecting(false)
      }
    } catch {
      setError(t.error)
      setRedirecting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-zinc-900/20 dark:bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-0">
              <div className="flex items-center gap-2.5">
                <Zap className="w-[18px] h-[18px] text-amber-500" />
                <h3 className="text-base font-semibold text-foreground tracking-tight">{t.title}</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground bg-secondary hover:bg-accent rounded-full transition-colors active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground px-5 mt-1">{t.subtitle}</p>

            {/* Content */}
            <div className="p-5 space-y-3">
              {loadingPackages ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">{t.loading}</span>
                </div>
              ) : redirecting ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">{t.redirecting}</span>
                </div>
              ) : (
                packages.map((pkg) => {
                  const badge = getBadge(pkg.debateCount, locale)
                  return (
                    <motion.button
                      key={pkg.id}
                      whileHover={{ scale: 1.01, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      onClick={() => handleSelect(pkg)}
                      className={cn(
                        "relative w-full flex items-center justify-between p-4 rounded-xl border transition-colors duration-200 text-left group",
                        "bg-card border-border/60 hover:border-primary/40 hover:shadow-md"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                          <Zap className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-bold text-foreground">{pkg.debateCount}</span>
                            <span className="text-[13px] text-muted-foreground">{t.debates}</span>
                            {badge && (
                              <span className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                                pkg.debateCount === 100
                                  ? "bg-blue-500/10 text-blue-500"
                                  : "bg-emerald-500/10 text-emerald-500"
                              )}>
                                {badge}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">{pkg.name}</span>
                        </div>
                      </div>
                      <span className="text-base font-semibold text-foreground whitespace-nowrap">
                        {formatPrice(pkg, locale)}
                      </span>
                    </motion.button>
                  )
                })
              )}
              {error && (
                <p className="text-[12px] text-red-500 text-center pt-1">{error}</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
