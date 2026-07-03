/** Server-side API key resolution: user-supplied key, env fallback, or 402 block. */
import { NextResponse } from "next/server"
import type { Provider } from "@/types"
import { authEnabled, requireUserKeys } from "@/lib/deploy-config"
import { redactSecrets } from "@/lib/redact-secrets"

export async function resolveUserProviderApiKey(
  provider: Provider,
  logLabel: string,
  requestKey?: string
): Promise<{ userApiKey?: string; blockedResponse?: NextResponse }> {
  // Anonymous BYOK: a key supplied in the request body short-circuits before any
  // auth import, DB read, or 402. Never logged.
  const bodyKey = typeof requestKey === "string" ? requestKey.trim() : undefined
  if (bodyKey) return { userApiKey: bodyKey }

  let userApiKey: string | undefined

  // Session lookup only when auth is configured, so a zero-backend deploy never imports @/lib/auth.
  if (authEnabled()) {
    const { auth } = await import("@/lib/auth")
    const session = await auth()

    if (session?.user?.id) {
      try {
        const { getUserProviderApiKey } = await import("@/lib/user-api-keys")
        userApiKey = await getUserProviderApiKey(session.user.id, provider)
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error(`[${logLabel}] failed to load user ${provider} API key:`, msg)

        if (requireUserKeys()) {
          return {
            blockedResponse: NextResponse.json({ error: "key_lookup_failed" }, { status: 500 }),
          }
        }
      }
    }
  }

  if (requireUserKeys() && !userApiKey) {
    return {
      blockedResponse: NextResponse.json({ error: "no_key", provider }, { status: 402 }),
    }
  }

  return { userApiKey }
}
