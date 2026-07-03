import { NextResponse } from "next/server"
import type { Provider } from "@/types"
import { requireUserKeys } from "@/lib/deploy-config"
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

  const { auth } = await import("@/lib/auth")
  const session = await auth()
  let userApiKey: string | undefined

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

  if (requireUserKeys() && !userApiKey) {
    return {
      blockedResponse: NextResponse.json({ error: "no_key", provider }, { status: 402 }),
    }
  }

  return { userApiKey }
}
