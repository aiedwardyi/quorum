"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Sparkles, LogIn } from "lucide-react"
import type { Locale } from "@/types"

const labels = {
  en: {
    noDebates: "You're out of debates",
    noDebatesDesc: "Buy more debates to continue using Quorum.",
    buyDebates: "Buy Debates",
    signupTitle: "Sign up for more",
    signupDesc: "Create a free account to get 10 debates per month.",
    signUp: "Sign up with Google",
  },
  ko: {
    noDebates: "토론이 모두 소진되었습니다",
    noDebatesDesc: "더 많은 토론을 구매하여 Quorum을 계속 이용하세요.",
    buyDebates: "토론 구매",
    signupTitle: "더 많은 토론을 받으세요",
    signupDesc: "무료 계정을 만들면 매월 10회 토론을 받을 수 있습니다.",
    signUp: "Google로 가입",
  },
}

export default function UpgradePrompt({
  isOpen,
  onClose,
  variant,
  onBuyDebates,
  onSignUp,
  locale,
}: {
  isOpen: boolean
  onClose: () => void
  variant: "signup" | "buy"
  onBuyDebates: () => void
  onSignUp: () => void
  locale: Locale
}) {
  const t = labels[locale]

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm mx-4 p-6 bg-card border border-border rounded-2xl shadow-xl text-center"
          >
            {variant === "buy" ? (
              <>
                <h2 className="text-lg font-bold text-foreground mb-2">{t.noDebates}</h2>
                <p className="text-sm text-muted-foreground mb-5">{t.noDebatesDesc}</p>
                <button
                  onClick={() => { onClose(); onBuyDebates() }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-bold rounded-xl transition-colors hover:opacity-90"
                >
                  <Sparkles className="w-4 h-4" />
                  {t.buyDebates}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold text-foreground mb-2">{t.signupTitle}</h2>
                <p className="text-sm text-muted-foreground mb-5">{t.signupDesc}</p>
                <button
                  onClick={() => { onClose(); onSignUp() }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-bold rounded-xl transition-colors hover:opacity-90"
                >
                  <LogIn className="w-4 h-4" />
                  {t.signUp}
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
