/** Server-side API key resolution: user-supplied key, free grant, env fallback, or 402 block. */
import { NextResponse } from "next/server"
import type { Provider } from "@/types"
import { authEnabled, requireUserKeys } from "@/lib/deploy-config"
import { redactSecrets } from "@/lib/redact-secrets"

export function isValidAccessCode(code: unknown): boolean {
  if (typeof code !== "string") return false
  const trimmed = code.trim()
  if (!trimmed) return false
  return (process.env.ACCESS_CODES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .includes(trimmed)
}

export type SoftKeyResult =
  | { status: "user"; apiKey: string }
  | { status: "server" }
  | { status: "none" }
  | { status: "lookup_failed" }

/** Soft resolve for multi-provider fallback - never returns a 402 Response. */
export async function softResolveProviderApiKey(
  provider: Provider,
  logLabel: string,
  requestKey?: string,
  accessCode?: string
): Promise<SoftKeyResult> {
  const bodyKey = typeof requestKey === "string" ? requestKey.trim() : undefined
  if (bodyKey) return { status: "user", apiKey: bodyKey }

  let userApiKey: string | undefined
  let userId: string | undefined

  if (authEnabled()) {
    const { auth } = await import("@/lib/auth")
    const session = await auth()
    userId = session?.user?.id

    if (userId) {
      try {
        const { getUserProviderApiKey } = await import("@/lib/user-api-keys")
        userApiKey = await getUserProviderApiKey(userId, provider)
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error(`[${logLabel}] failed to load user ${provider} API key:`, msg)
        if (requireUserKeys()) return { status: "lookup_failed" }
      }
    }
  }

  if (userApiKey) return { status: "user", apiKey: userApiKey }

  if (requireUserKeys()) {
    if (isValidAccessCode(accessCode)) return { status: "server" }

    if (userId) {
      try {
        const { tryClaimFreeServerAccess } = await import("@/lib/free-debates")
        if (await tryClaimFreeServerAccess(userId)) return { status: "server" }
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error(`[${logLabel}] free debate claim failed:`, msg)
        // Fall through to none - do not 500 the whole debate path on grant errors.
      }
    }

    return { status: "none" }
  }

  return { status: "server" }
}

export async function resolveUserProviderApiKey(
  provider: Provider,
  logLabel: string,
  requestKey?: string,
  accessCode?: string
): Promise<{ userApiKey?: string; blockedResponse?: NextResponse }> {
  const soft = await softResolveProviderApiKey(provider, logLabel, requestKey, accessCode)

  if (soft.status === "user") return { userApiKey: soft.apiKey }
  if (soft.status === "server") return {}
  if (soft.status === "lookup_failed") {
    return {
      blockedResponse: NextResponse.json({ error: "key_lookup_failed" }, { status: 500 }),
    }
  }
  return {
    blockedResponse: NextResponse.json({ error: "no_key", provider }, { status: 402 }),
  }
}
