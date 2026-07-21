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

export type Blocked402 = {
  kind: "no_key" | "host_budget_exceeded"
  provider: Provider | null
}

export function parse402Payload(payload: unknown): Blocked402 | null {
  if (!payload || typeof payload !== "object") return null
  const obj = payload as Record<string, unknown>
  if (obj.error !== "no_key" && obj.error !== "host_budget_exceeded") return null
  const provider =
    typeof obj.provider === "string" && PROVIDERS.has(obj.provider as Provider)
      ? (obj.provider as Provider)
      : null
  return { kind: obj.error, provider }
}

export async function parse402FromResponse(response: Response): Promise<Blocked402 | null> {
  try {
    return parse402Payload(await response.json())
  } catch {
    return null
  }
}

// The budget wall blocks before an UNUSED grant is consumed, but it can also
// hit mid-debate after the grant was already claimed - promise only the unused case.
export function getBudgetExceededMessage(signedIn: boolean, locale: Locale = "en"): string {
  if (signedIn) {
    return locale === "ko"
      ? "오늘의 무료 토론이 모두 소진됐어요. 아직 안 쓴 무료 토론은 내일 그대로 쓸 수 있어요. Settings에서 API 키를 추가하면 바로 시작할 수 있어요."
      : "Today's free debates are maxed out - an unused free debate stays yours for tomorrow. Or add your own API key in Settings to start now."
  }
  return locale === "ko"
    ? "오늘의 무료 토론이 모두 소진됐어요. 내일 다시 오거나 Settings에서 API 키를 추가해 시작하세요."
    : "Today's free debates are maxed out - come back tomorrow, or add your own API key in Settings to start now."
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
