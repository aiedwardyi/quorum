import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  deleteUserApiKey,
  getUserApiKeyStatus,
  isUserApiKeyProvider,
  saveUserApiKey,
} from "@/lib/user-api-keys"
import { redactSecrets } from "@/lib/redact-secrets"
import type { Provider } from "@/types"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const keys = await getUserApiKeyStatus(session.user.id)
  return NextResponse.json({ keys })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const keys =
      body.keys && typeof body.keys === "object" ? (body.keys as Record<string, unknown>) : {}
    const clear = Array.isArray(body.clear) ? body.clear : []

    for (const provider of clear) {
      if (isUserApiKeyProvider(provider)) {
        await deleteUserApiKey(session.user.id, provider)
      }
    }

    for (const [provider, rawValue] of Object.entries(keys)) {
      if (!isUserApiKeyProvider(provider)) continue
      if (typeof rawValue !== "string") continue

      const apiKey = rawValue.trim()
      if (!apiKey) continue

      await saveUserApiKey(session.user.id, provider as Provider, apiKey)
    }

    const nextStatus = await getUserApiKeyStatus(session.user.id)
    return NextResponse.json({ keys: nextStatus })
  } catch (error) {
    const message =
      error instanceof Error ? redactSecrets(error.message) : "Failed to update API keys"
    console.error("[user-api-keys] update failed:", message)
    return NextResponse.json({ error: "Failed to update API keys" }, { status: 500 })
  }
}
