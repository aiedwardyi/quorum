// Browser-only BYOK storage: the user's API keys live in localStorage, one per provider.
import { type Provider, USER_API_KEY_PROVIDERS } from "@/types"

const KEY_PREFIX = "quorum_api_key_"

function storageKey(provider: Provider): string {
  return `${KEY_PREFIX}${provider}`
}

export function getClientKey(provider: Provider): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(storageKey(provider)) ?? ""
}

export function setClientKey(provider: Provider, key: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(storageKey(provider), key)
}

export function clearClientKey(provider: Provider): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(storageKey(provider))
}

export function clearAllClientKeys(): void {
  for (const provider of USER_API_KEY_PROVIDERS) clearClientKey(provider)
}

export function getClientKeyStatus(): Record<Provider, boolean> {
  return USER_API_KEY_PROVIDERS.reduce(
    (acc, provider) => {
      acc[provider] = Boolean(getClientKey(provider))
      return acc
    },
    {} as Record<Provider, boolean>
  )
}

type SessionStatus = "authenticated" | "unauthenticated" | "loading"

// True when the browser's localStorage keys should be sent. Auth-enabled deploys
// wait for a definitive "unauthenticated" so a still-loading or signed-in session
// never sends a stale anonymous key over the account's saved key.
export function shouldUseClientKeys(authEnabled: boolean, status: SessionStatus): boolean {
  return !authEnabled || status === "unauthenticated"
}
