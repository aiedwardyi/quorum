"use client"

import { signIn } from "next-auth/react"
import { X } from "lucide-react"
import type { Locale } from "@/types"

// ---- Constants ----
// Aligned with useDebateBalance hook - single source of truth for anon limits
export const FREE_DEBATE_LIMIT = 3
const STORAGE_KEY = "quorum_anon_debates"
const PENDING_KEY = "quorum_pending"

// ---- Pure logic (exported for testing) ----
export function getDebateCount(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return isNaN(n) ? 0 : n
}

export function incrementDebateCount(): void {
  localStorage.setItem(STORAGE_KEY, String(getDebateCount() + 1))
}

export function shouldShowLoginGate(isLoggedIn: boolean): boolean {
  if (isLoggedIn) return false
  return getDebateCount() >= FREE_DEBATE_LIMIT
}

type PendingDebate = {
  prompt: string
  originalPrompt: string
  hadFiles: boolean
  models: string[]
  responseLength: string
  rounds: number
  locale: string
}

export function savePendingDebate(config: PendingDebate): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(config))
}

export function loadPendingDebate(): PendingDebate | null {
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return null
  sessionStorage.removeItem(PENDING_KEY)
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---- Component ----
export default function LoginGateModal({
  onClose,
  locale,
}: {
  onClose: () => void
  locale: Locale
}) {
  const t = locale === "ko"
    ? { title: "계속하려면 로그인하세요", desc: "토론을 저장하고 이어서 진행하려면 Google로 로그인하세요.", button: "Google로 로그인" }
    : { title: "Sign in to continue", desc: "Log in with Google to save your debates and keep the conversation going.", button: "Sign in with Google" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="login-gate-title">
        <button onClick={onClose} aria-label={locale === "ko" ? "닫기" : "Close"} className="absolute top-3 right-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h2 id="login-gate-title" className="text-lg font-semibold text-[var(--foreground)] mb-2">{t.title}</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">{t.desc}</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="w-full flex items-center justify-center gap-2 bg-white text-gray-800 font-medium py-2.5 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {t.button}
        </button>
      </div>
    </div>
  )
}
