/** Pick a consensus provider from preferred models + available keys. */
import type { Provider } from "@/types"
import { softResolveProviderApiKey, isValidAccessCode } from "@/lib/server-provider-keys"
import { getConfiguredGeminiApiKey } from "@/lib/providers/gemini"

/** Full consensus chain. Structured models first; Perplexity always last (search-first JSON). */
export const CONSENSUS_PROVIDERS: readonly Provider[] = ["gemini", "claude", "gpt", "perplexity"]
const STRUCTURED_CONSENSUS: readonly Provider[] = ["gemini", "claude", "gpt"]

export type ConsensusCandidate = {
  provider: Provider
  /** User/body key when present; omit to use server env / Vertex. */
  apiKey?: string
}

function hasServerCreds(provider: Provider): boolean {
  switch (provider) {
    case "gemini":
      return Boolean(getConfiguredGeminiApiKey() || process.env.VERTEX_PROJECT_ID?.trim())
    case "claude": {
      const k = process.env.ANTHROPIC_API_KEY?.trim()
      return Boolean(k && !k.startsWith("your_"))
    }
    case "gpt": {
      const k = process.env.OPENAI_API_KEY?.trim()
      return Boolean(k && !k.startsWith("your_"))
    }
    case "perplexity": {
      const k = process.env.PERPLEXITY_API_KEY?.trim()
      return Boolean(k && !k.startsWith("your_"))
    }
  }
}

/**
 * Prefer structured models that joined the debate, then the rest of the structured
 * set, then Perplexity last so a Perplexity-only BYOK still gets a shot.
 */
export function buildConsensusProviderOrder(preferred?: unknown): Provider[] {
  const preferredStructured = Array.isArray(preferred)
    ? preferred.filter(
        (p): p is Provider =>
          typeof p === "string" && (STRUCTURED_CONSENSUS as readonly string[]).includes(p)
      )
    : []
  const seen = new Set<Provider>()
  const order: Provider[] = []
  for (const p of [...preferredStructured, ...STRUCTURED_CONSENSUS, "perplexity" as Provider]) {
    if (seen.has(p)) continue
    seen.add(p)
    order.push(p)
  }
  return order
}

export async function resolveConsensusCandidates(
  order: Provider[],
  bodyKeys: Partial<Record<Provider, string>>,
  accessCode: string | undefined,
  logLabel: string
): Promise<{ candidates: ConsensusCandidate[]; lookupFailed: boolean }> {
  const candidates: ConsensusCandidate[] = []
  let lookupFailed = false
  // Anonymous body-key BYOK: never touch session/auth. Only the pasted keys (plus
  // access-code server unlock for any missing providers) are eligible.
  const bodyOnly = Object.values(bodyKeys).some((k) => Boolean(k?.trim()))
  const accessOk = isValidAccessCode(accessCode)

  for (const provider of order) {
    const bodyKey = bodyKeys[provider]?.trim()
    if (bodyKey) {
      candidates.push({ provider, apiKey: bodyKey })
      continue
    }

    if (bodyOnly) {
      if (accessOk && hasServerCreds(provider)) candidates.push({ provider })
      continue
    }

    const soft = await softResolveProviderApiKey(provider, logLabel, undefined, accessCode)
    if (soft.status === "lookup_failed") {
      lookupFailed = true
      continue
    }
    if (soft.status === "user") {
      candidates.push({ provider, apiKey: soft.apiKey })
      continue
    }
    if (soft.status === "server" && hasServerCreds(provider)) {
      candidates.push({ provider })
    }
  }

  return { candidates, lookupFailed }
}

/** Plain-language error for the chat thread - not stack traces. */
export function humanVerdictError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("deadline") ||
    lower.includes("504")
  ) {
    return "The consensus step took too long. Try again, or switch Response length to Medium."
  }
  if (
    lower.includes("429") ||
    lower.includes("rate") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted")
  ) {
    return "The AI hit a temporary rate limit. Wait a few seconds and send again."
  }
  if (
    lower.includes("403") ||
    lower.includes("401") ||
    lower.includes("permission") ||
    lower.includes("api key") ||
    lower.includes("invalid") ||
    lower.includes("unauthenticated")
  ) {
    return "Couldn't reach that AI with the current key. Check Settings, or add another model key."
  }
  if (lower.includes("empty response")) {
    return "The consensus model returned an empty answer. Send a new message to try again."
  }
  return "Couldn't finish the consensus this time. Send a new message to try again."
}

export const NO_CONSENSUS_KEY_MESSAGE =
  "Add an API key in Settings so we can write the consensus."
