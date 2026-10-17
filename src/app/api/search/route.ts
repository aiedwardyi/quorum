/** Web search for the think hard verdict; gated like /api/chat for Perplexity. */
import { NextRequest, NextResponse } from "next/server"
import { SEARCH_ESTIMATE_CENTS } from "@/lib/host-spend"
import { SEARCH_REQUEST_CENTS, logHostCost } from "@/lib/host-cost"
import { redactSecrets } from "@/lib/redact-secrets"
import { resolveUserProviderApiKey } from "@/lib/server-provider-keys"
import { MAX_SEARCH_QUERY, MAX_SOURCES, sanitizeSources } from "@/lib/web-sources"

const PERPLEXITY_SEARCH_URL = "https://api.perplexity.ai/search"
const SEARCH_TIMEOUT_MS = 6_000

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (!query || query.length > MAX_SEARCH_QUERY) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 })
  }

  const requestApiKey = typeof body.userApiKey === "string" ? body.userApiKey : undefined
  const requestAccessCode = typeof body.accessCode === "string" ? body.accessCode : undefined
  const { userApiKey, blockedResponse } = await resolveUserProviderApiKey(
    "perplexity",
    "search",
    requestApiKey,
    requestAccessCode,
    { cents: SEARCH_ESTIMATE_CENTS }
  )
  if (blockedResponse) return blockedResponse

  try {
    const apiKey = userApiKey || process.env.PERPLEXITY_API_KEY
    if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not set")
    const res = await fetch(PERPLEXITY_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: MAX_SOURCES, max_tokens_per_page: 256 }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new Error(`Perplexity search error (${res.status}): ${await res.text()}`)
    }
    if (!userApiKey) logHostCost("search", SEARCH_REQUEST_CENTS)
    const data = (await res.json()) as { results?: unknown }
    return NextResponse.json({ sources: sanitizeSources(data.results) })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    console.error("[search] failed:", redactSecrets(msg))
    return NextResponse.json({ sources: [] })
  }
}
