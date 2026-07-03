import type { Provider } from "@/types"
import type { Locale } from "@/types"

const PROVIDER_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
  gpt: "GPT",
}

const PROVIDERS = new Set<Provider>(Object.keys(PROVIDER_NAMES) as Provider[])

export function parseNoKeyProvider(payload: unknown): Provider | null {
  if (!payload || typeof payload !== "object") return null
  const obj = payload as Record<string, unknown>
  if (obj.error !== "no_key") return null
  if (typeof obj.provider !== "string") return null
  return PROVIDERS.has(obj.provider as Provider) ? (obj.provider as Provider) : null
}

export async function parseNoKeyProviderFromResponse(response: Response): Promise<Provider | null> {
  try {
    return parseNoKeyProvider(await response.json())
  } catch {
    return null
  }
}

export function getMissingApiKeyMessage(provider: Provider, locale: Locale = "en"): string {
  if (locale === "ko") {
    return `Settings에서 ${PROVIDER_NAMES[provider]} API 키를 추가해 토론을 시작하세요.`
  }
  return `Add your ${PROVIDER_NAMES[provider]} API key in Settings to start debating.`
}
