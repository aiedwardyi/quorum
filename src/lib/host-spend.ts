/** App-side daily budget for host (server) API keys. BYOK is never counted. */
import type { Provider } from "@/types"
import { prisma } from "@/lib/prisma"

// Default $25/day. Override with HOST_KEY_DAILY_BUDGET_USD. Set 0 to block host keys.
const DEFAULT_BUDGET_USD = 25

// Conservative high-side estimates so we stop early, not late.
const ESTIMATE_CENTS: Record<Provider, number> = {
  gemini: 3,
  claude: 10,
  gpt: 8,
  perplexity: 6,
}

export function getDailyBudgetCents(): number {
  const raw = process.env.HOST_KEY_DAILY_BUDGET_USD?.trim()
  if (raw === undefined || raw === "") return DEFAULT_BUDGET_USD * 100
  const usd = Number(raw)
  if (!Number.isFinite(usd) || usd < 0) return DEFAULT_BUDGET_USD * 100
  return Math.round(usd * 100)
}

export function estimateHostCallCents(provider: Provider): number {
  return ESTIMATE_CENTS[provider]
}

export function utcSpendDay(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export type HostSpendStatus = {
  day: string
  centsUsed: number
  budgetCents: number
  remainingCents: number
}

export async function getHostSpendStatus(): Promise<HostSpendStatus> {
  const day = utcSpendDay()
  const budgetCents = getDailyBudgetCents()
  const row = await prisma.hostSpendDay.findUnique({ where: { day } })
  const centsUsed = row?.centsUsed ?? 0
  return {
    day,
    centsUsed,
    budgetCents,
    remainingCents: Math.max(0, budgetCents - centsUsed),
  }
}

/** Atomically reserve estimated cents for one host-key call. False = over budget. */
export async function tryReserveHostSpend(cents: number): Promise<boolean> {
  if (cents <= 0) return true
  const budgetCents = getDailyBudgetCents()
  if (budgetCents <= 0) return false

  const day = utcSpendDay()
  await prisma.hostSpendDay.upsert({
    where: { day },
    create: { day, centsUsed: 0 },
    update: {},
  })

  const maxBefore = budgetCents - cents
  if (maxBefore < 0) return false

  const updated = await prisma.hostSpendDay.updateMany({
    where: { day, centsUsed: { lte: maxBefore } },
    data: { centsUsed: { increment: cents } },
  })
  return updated.count === 1
}
