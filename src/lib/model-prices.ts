/** List prices for host-key cost logging, USD per 1M tokens unless noted. */

type Rates = {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export type ModelPrice = Rates & {
  /** USD per request (Perplexity's fee at its default low search context). */
  request?: number
  long?: Rates & { above: number }
  later?: Rates & { from: string }
  source: string
  checked: string
}

const ANTHROPIC = "https://platform.claude.com/docs/en/about-claude/pricing"
const OPENAI = "https://developers.openai.com/api/docs/pricing"
const GOOGLE = "https://ai.google.dev/gemini-api/docs/pricing"
const PERPLEXITY = "https://docs.perplexity.ai/getting-started/pricing"

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "claude-opus-5-5": {
    input: 4,
    output: 20,
    cacheWrite: 5,
    cacheRead: 0.2,
    source: ANTHROPIC,
    checked: "2026-10-17",
  },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    long: { above: 100_000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
    source: ANTHROPIC,
    checked: "2026-10-17",
  },
  "gpt-6.1-sol": {
    input: 2,
    output: 10,
    cacheRead: 0.1,
    long: { above: 272_000, input: 4, output: 15, cacheRead: 0.2 },
    source: OPENAI,
    checked: "2026-10-17",
  },
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25, source: OPENAI, checked: "2026-10-17" },
  // Introductory rates double on 2027-01-01.
  "gemini-3.8-flash": {
    input: 0.75,
    output: 3.75,
    cacheRead: 0.075,
    later: { from: "2027-01-01", input: 1.5, output: 7.5, cacheRead: 0.15 },
    source: GOOGLE,
    checked: "2026-10-17",
  },
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    cacheRead: 0.03,
    source: GOOGLE,
    checked: "2026-10-21",
  },
  "sonar-pro": { input: 3, output: 15, request: 0.006, source: PERPLEXITY, checked: "2026-10-17" },
  "sonar-reasoning-pro": {
    input: 2,
    output: 8,
    request: 0.006,
    source: PERPLEXITY,
    checked: "2026-10-17",
  },
}

// Perplexity Search API, standard mode; checked 2026-10-17 at PERPLEXITY.
export const SEARCH_REQUEST_USD = 0.005

export function ratesFor(model: string, day: string, promptTokens: number): Rates | undefined {
  const price = MODEL_PRICES[model]
  if (!price) return undefined
  if (price.later && day >= price.later.from) return price.later
  if (price.long && promptTokens > price.long.above) return price.long
  return price
}

export function requestFeeUsd(model: string): number {
  return MODEL_PRICES[model]?.request ?? 0
}
