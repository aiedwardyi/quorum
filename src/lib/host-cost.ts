/** Real host-key cost per Seoul day and provider: reported usage x list price. BYOK is never logged. */
import type { Provider } from "@/types"
import { prisma } from "@/lib/prisma"
import { hasDatabase } from "@/lib/host-spend"
import { SEARCH_REQUEST_USD, ratesFor, requestFeeUsd } from "@/lib/model-prices"
import { seoulDay } from "@/lib/seoul-day"

export type CostProvider = Provider | "search"

export type ModelUsage = {
  model: string
  /** Uncached input only; cache reads and writes are counted apart. */
  inputTokens: number
  /** Includes thinking/reasoning tokens. */
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /** Provider-computed total (Perplexity), used as-is when present. */
  costUsd?: number
}

export type UsageSink = (usage: ModelUsage) => void

export type ExactUsage = Partial<Omit<ModelUsage, "model">>

function asciiCount(text: string): number {
  let ascii = 0
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) < 128) ascii++
  return ascii
}

/** ASCII chars / 4 plus 1 per non-ASCII char, so Korean isn't undercounted 4x. */
export function estimateTokens(text: string): number {
  const ascii = asciiCount(text)
  return Math.ceil(ascii / 4) + (text.length - ascii)
}

/** One streamed call's usage: exact provider numbers as they arrive, text estimates for the rest. */
export function streamUsage(model: string, prompt: string, onUsage?: UsageSink) {
  const exact: ExactUsage = {}
  const promptTokens = estimateTokens(prompt)
  let ascii = 0
  let other = 0
  const emit = () => {
    // Estimate: a cut stream never sends final usage, so fill only what the provider hasn't reported.
    onUsage?.({
      model,
      ...exact,
      inputTokens: exact.inputTokens ?? promptTokens,
      outputTokens: exact.outputTokens ?? Math.ceil(ascii / 4) + other,
    })
  }
  return {
    /** The provider accepted the request, so at least the input is billed. */
    started: emit,
    text(chunk: string) {
      const a = asciiCount(chunk)
      ascii += a
      other += chunk.length - a
      emit()
    },
    exact(usage: ExactUsage) {
      for (const [key, value] of Object.entries(usage) as [keyof ExactUsage, number][]) {
        if (typeof value === "number" && Number.isFinite(value)) exact[key] = value
      }
      emit()
    },
  }
}

export function usageCents(usage: ModelUsage, day = seoulDay()): number {
  if (typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd)) {
    return usage.costUsd * 100
  }
  const cacheRead = usage.cacheReadTokens ?? 0
  const cacheWrite = usage.cacheWriteTokens ?? 0
  const rates = ratesFor(usage.model, day, usage.inputTokens + cacheRead + cacheWrite)
  if (!rates) {
    console.warn(`[host-cost] no price for model ${usage.model}; counting 0`)
    return 0
  }
  const usd =
    (usage.inputTokens * rates.input +
      cacheRead * (rates.cacheRead ?? rates.input) +
      cacheWrite * (rates.cacheWrite ?? rates.input) +
      usage.outputTokens * rates.output) /
      1_000_000 +
    requestFeeUsd(usage.model)
  return usd * 100
}

export const SEARCH_REQUEST_CENTS = SEARCH_REQUEST_USD * 100

export const COST_WRITE_CAP_MS = 2_000

/** Never rejects. Amplify pauses a function once its response ends, so await it before then. */
export async function logHostCost(provider: CostProvider, cents: number): Promise<void> {
  if (!hasDatabase()) return
  try {
    const day = seoulDay()
    const safe = Number.isFinite(cents) && cents > 0 ? cents : 0
    await prisma.hostCostDay.upsert({
      where: { day_provider: { day, provider } },
      create: { day, provider, cents: safe, calls: 1 },
      update: { cents: { increment: safe }, calls: { increment: 1 } },
    })
  } catch (error) {
    console.error("[host-cost] log failed:", error instanceof Error ? error.message : error)
  }
}

export async function logHostUsage(
  provider: Provider,
  usage: ModelUsage | undefined
): Promise<void> {
  if (!usage) return
  try {
    await logHostCost(provider, usageCents(usage))
  } catch (error) {
    console.error("[host-cost] cost failed:", error instanceof Error ? error.message : error)
  }
}

/** Resolves when the write lands or after the cap, whichever is first. */
export function capCostWrite(write: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, COST_WRITE_CAP_MS)
  })
  return Promise.race([write, cap]).finally(() => clearTimeout(timer))
}
