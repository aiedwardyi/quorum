/** Server-side API key resolution: user key, free grant, access code, env, or 402. */
import { NextResponse } from "next/server"
import type { Provider } from "@/types"
import { authEnabled, requireUserKeys } from "@/lib/deploy-config"
import { hasServerCreds } from "@/lib/host-credentials"
import { estimateHostCallCents, releaseHostSpend, tryReserveHostSpend } from "@/lib/host-spend"
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

export type SoftResolveOptions = {
  /** When false, only an already-open free window counts (no new claim). Default true. */
  claimFree?: boolean
}

export type ResolveKeyOptions = {
  /** Multiplier for host-spend estimates (e.g. OCR page count). */
  units?: number
}

/** Soft resolve for multi-provider fallback - never returns a 402 Response. */
export async function softResolveProviderApiKey(
  provider: Provider,
  logLabel: string,
  requestKey?: string,
  accessCode?: string,
  options?: SoftResolveOptions
): Promise<SoftKeyResult> {
  const claimFree = options?.claimFree !== false
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
    if (isValidAccessCode(accessCode)) {
      if (!hasServerCreds(provider)) return { status: "none" }
      return { status: "server" }
    }

    if (userId && hasServerCreds(provider)) {
      try {
        const free = await import("@/lib/free-debates")
        // Callers that actually bill should pass claimFree: false and consume after budget reserve.
        const ok = claimFree
          ? await free.tryConsumeFreeServerAccess(userId)
          : await free.peekFreeServerAccess(userId)
        if (ok) return { status: "server" }
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error(`[${logLabel}] free debate access failed:`, msg)
      }
    }

    return { status: "none" }
  }

  if (!hasServerCreds(provider)) return { status: "none" }
  return { status: "server" }
}

function budgetExceededResponse(provider: Provider): NextResponse {
  return NextResponse.json({ error: "host_budget_exceeded", provider }, { status: 402 })
}

export async function resolveUserProviderApiKey(
  provider: Provider,
  logLabel: string,
  requestKey?: string,
  accessCode?: string,
  options?: ResolveKeyOptions
): Promise<{ userApiKey?: string; blockedResponse?: NextResponse }> {
  const units = options?.units ?? 1
  const cents = estimateHostCallCents(provider, units)

  // Peek only - never burn free before budget is reserved.
  const soft = await softResolveProviderApiKey(provider, logLabel, requestKey, accessCode, {
    claimFree: false,
  })

  if (soft.status === "user") return { userApiKey: soft.apiKey }
  if (soft.status === "lookup_failed") {
    return {
      blockedResponse: NextResponse.json({ error: "key_lookup_failed" }, { status: 500 }),
    }
  }

  if (soft.status === "server") {
    if (!(await tryReserveHostSpend(cents))) {
      return { blockedResponse: budgetExceededResponse(provider) }
    }
    // Free window was peeked: consume one call after budget is locked.
    if (requireUserKeys() && !isValidAccessCode(accessCode) && authEnabled()) {
      const { auth } = await import("@/lib/auth")
      const session = await auth()
      if (session?.user?.id) {
        const free = await import("@/lib/free-debates")
        if (!(await free.tryConsumeFreeServerAccess(session.user.id))) {
          await releaseHostSpend(cents)
          return {
            blockedResponse: NextResponse.json({ error: "no_key", provider }, { status: 402 }),
          }
        }
      }
    }
    return {}
  }

  // No active free window / access code: try claiming free only after budget reserve.
  if (
    requireUserKeys() &&
    hasServerCreds(provider) &&
    authEnabled() &&
    !isValidAccessCode(accessCode)
  ) {
    const { auth } = await import("@/lib/auth")
    const session = await auth()
    if (session?.user?.id) {
      if (!(await tryReserveHostSpend(cents))) {
        return { blockedResponse: budgetExceededResponse(provider) }
      }
      try {
        const free = await import("@/lib/free-debates")
        if (await free.tryConsumeFreeServerAccess(session.user.id)) {
          return {}
        }
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error(`[${logLabel}] free debate claim failed:`, msg)
      }
      await releaseHostSpend(cents)
    }
  }

  return {
    blockedResponse: NextResponse.json({ error: "no_key", provider }, { status: 402 }),
  }
}
