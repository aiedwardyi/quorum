/** App-side daily budget for host (server) API keys. BYOK is never counted. */
import type { Provider } from "@/types"
import { prisma } from "@/lib/prisma"
import { seoulDay } from "@/lib/seoul-day"

// Default $25/day. Override with HOST_KEY_DAILY_BUDGET_USD. Set 0 to block host keys.
const DEFAULT_BUDGET_USD = 25

// Conservative high-side estimates so we stop early, not late.
const ESTIMATE_CENTS: Record<Provider, number> = {
  gemini: 3,
  claude: 10,
  gpt: 8,
  perplexity: 6,
}

// Think hard per call at 20k input + 3k output (thinking included), 2027 Vertex rates,
// Perplexity's high-context request fee. Real rounds measured well under this.
const THINK_HARD_ESTIMATE_CENTS: Record<Provider, number> = {
  gemini: 6,
  claude: 15,
  gpt: 8,
  perplexity: 8,
}

// Perplexity Search API: $5 per 1k requests, no token charge.
export const SEARCH_ESTIMATE_CENTS = 1

export function getDailyBudgetCents(): number {
  const raw = process.env.HOST_KEY_DAILY_BUDGET_USD?.trim()
  if (raw === undefined || raw === "") return DEFAULT_BUDGET_USD * 100
  const usd = Number(raw)
  if (!Number.isFinite(usd) || usd < 0) return DEFAULT_BUDGET_USD * 100
  return Math.round(usd * 100)
}

export function estimateHostCallCents(provider: Provider, units = 1, thinkHard = false): number {
  const n = Number.isFinite(units) ? Math.max(1, Math.floor(units)) : 1
  return (thinkHard ? THINK_HARD_ESTIMATE_CENTS : ESTIMATE_CENTS)[provider] * n
}

export type HostSpendStatus = {
  day: string
  centsUsed: number
  budgetCents: number
  remainingCents: number
}

export type HostSpendReserveResult =
  | { ok: true; day: string; cents: number }
  | { ok: false; day: string; cents: number }

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim())
}

export async function getHostSpendStatus(): Promise<HostSpendStatus> {
  const day = seoulDay()
  const budgetCents = getDailyBudgetCents()
  if (!hasDatabase()) {
    return { day, centsUsed: 0, budgetCents, remainingCents: budgetCents }
  }
  const row = await prisma.hostSpendDay.findUnique({ where: { day } })
  const centsUsed = row?.centsUsed ?? 0
  return {
    day,
    centsUsed,
    budgetCents,
    remainingCents: Math.max(0, budgetCents - centsUsed),
  }
}

/** Atomically reserve estimated cents for one host-key call. */
export async function tryReserveHostSpend(cents: number): Promise<HostSpendReserveResult> {
  const day = seoulDay()
  if (cents <= 0) return { ok: true, day, cents: 0 }
  const budgetCents = getDailyBudgetCents()
  if (budgetCents <= 0) return { ok: false, day, cents }
  // Pure local BYOK / no DB: don't hard-fail host keys on missing tracking table.
  if (!hasDatabase()) return { ok: true, day, cents }

  try {
    await prisma.hostSpendDay.upsert({
      where: { day },
      create: { day, centsUsed: 0 },
      // Prisma rejects empty update objects - no-op increment keeps the row touch valid.
      update: { centsUsed: { increment: 0 } },
    })

    const maxBefore = budgetCents - cents
    if (maxBefore < 0) return { ok: false, day, cents }

    const updated = await prisma.hostSpendDay.updateMany({
      where: { day, centsUsed: { lte: maxBefore } },
      data: { centsUsed: { increment: cents } },
    })
    return updated.count === 1 ? { ok: true, day, cents } : { ok: false, day, cents }
  } catch (error) {
    console.error("[host-spend] reserve failed:", error)
    return { ok: false, day, cents }
  }
}

/** Undo a reserve; pass the day from tryReserveHostSpend so midnight cannot orphan the refund. */
export async function releaseHostSpend(cents: number, day: string): Promise<void> {
  if (cents <= 0 || !hasDatabase() || !day) return
  try {
    await prisma.hostSpendDay.updateMany({
      where: { day, centsUsed: { gte: cents } },
      data: { centsUsed: { decrement: cents } },
    })
  } catch (error) {
    console.error("[host-spend] release failed:", error)
  }
}
