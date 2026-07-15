/** User-facing error messages and response parsing for missing API keys. */
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

// Generic first-run welcome for a keyless visitor; names the specific provider
// once they have a key, so a mid-debate miss still points at the exact gap.
// Signed-out visitors get the free-debate invite when auth is on.
export function getApiKeyPromptMessage(
  provider: Provider,
  keyless: boolean,
  locale: Locale = "en",
  opts?: { signedIn?: boolean; authOn?: boolean }
): string {
  const authOn = opts?.authOn === true
  const signedIn = opts?.signedIn === true

  if (keyless && authOn && !signedIn) {
    return locale === "ko"
      ? "Google로 로그인하면 무료 토론 1회, 또는 Settings에서 API 키를 추가하세요."
      : "Sign in with Google for 1 free debate, or add an API key in Settings."
  }

  if (keyless && signedIn) {
    return locale === "ko"
      ? "무료 토론을 다 썼어요. Settings에서 API 키를 추가해 이어가세요."
      : "Free debate used. Add an API key in Settings to continue."
  }

  if (keyless) {
    return locale === "ko"
      ? "Settings에서 첫 API 키를 추가해 토론을 시작하세요."
      : "Add your first API key in Settings to start debating."
  }
  return getMissingApiKeyMessage(provider, locale)
}
