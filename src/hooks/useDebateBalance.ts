"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import type { Provider, DebateBalanceInfo } from "@/types"

const ANON_MODELS: Provider[] = ["gpt", "perplexity"]
const ANON_LIMIT = 3
const ANON_STORAGE_KEY = "quorum_anon_debates"

function getAnonCount(): number {
  if (typeof window === "undefined") return 0
  return parseInt(localStorage.getItem(ANON_STORAGE_KEY) || "0", 10)
}

function incrementAnonCount(): number {
  const next = getAnonCount() + 1
  localStorage.setItem(ANON_STORAGE_KEY, String(next))
  return next
}

const ANON_DEFAULT: DebateBalanceInfo = {
  tier: "anonymous",
  balance: 0,
  freeDebatesRemaining: ANON_LIMIT,
  hasUsedClaudeBonus: false,
  allowedModels: ANON_MODELS,
}

export function useDebateBalance() {
  const { data: session, status: sessionStatus } = useSession()
  const isLoggedIn = !!session?.user
  const sessionLoading = sessionStatus === "loading"

  // Server-fetched balance for authenticated users
  const [serverBalance, setServerBalance] = useState<DebateBalanceInfo | null>(null)
  const [fetchDone, setFetchDone] = useState(false)

  // Fetch balance from API only for logged-in users
  /* eslint-disable react-hooks/set-state-in-effect -- data fetching pattern */
  useEffect(() => {
    if (sessionLoading) return
    if (!isLoggedIn) {
      setFetchDone(true)
      return
    }
    let cancelled = false
    fetch("/api/debates/balance")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data && !cancelled) setServerBalance(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetchDone(true) })
    return () => { cancelled = true }
  }, [isLoggedIn, sessionLoading])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Compute anonymous info synchronously (no effect needed)
  const anonInfo = useMemo<DebateBalanceInfo>(() => {
    const used = getAnonCount()
    return {
      tier: "anonymous",
      balance: 0,
      freeDebatesRemaining: Math.max(0, ANON_LIMIT - used),
      hasUsedClaudeBonus: false,
      allowedModels: ANON_MODELS,
    }
  }, [])

  const loading = sessionLoading || !fetchDone
  const balanceInfo = isLoggedIn ? (serverBalance ?? ANON_DEFAULT) : anonInfo

  const refresh = useCallback(async () => {
    if (!isLoggedIn) return
    try {
      const res = await fetch("/api/debates/balance")
      if (res.ok) {
        const data = await res.json()
        setServerBalance(data)
      }
    } catch {
      // Silently fail
    }
  }, [isLoggedIn])

  const canStartDebate = useCallback(
    (models: Provider[]): { allowed: boolean; reason?: string } => {
      if (!isLoggedIn) {
        const remaining = Math.max(0, ANON_LIMIT - getAnonCount())
        if (remaining <= 0) {
          return { allowed: false, reason: "signup" }
        }
        const blocked = models.filter((m) => !ANON_MODELS.includes(m))
        if (blocked.length > 0) {
          return { allowed: false, reason: "model_locked" }
        }
        return { allowed: true }
      }

      const blocked = models.filter((m) => !balanceInfo.allowedModels.includes(m))
      if (blocked.length > 0) {
        return { allowed: false, reason: "model_locked" }
      }

      if (balanceInfo.freeDebatesRemaining > 0) return { allowed: true }
      if (balanceInfo.balance > 0) return { allowed: true }

      // Claude bonus check - must have zero paid balance (matches server logic)
      const usesClaude = models.includes("claude")
      if (usesClaude && !balanceInfo.hasUsedClaudeBonus && balanceInfo.balance === 0) return { allowed: true }

      return { allowed: false, reason: "no_debates" }
    },
    [isLoggedIn, balanceInfo]
  )

  const deductAnonymous = useCallback(() => {
    incrementAnonCount()
  }, [])

  return {
    ...balanceInfo,
    loading,
    isLoggedIn,
    canStartDebate,
    deductAnonymous,
    refresh,
  }
}
