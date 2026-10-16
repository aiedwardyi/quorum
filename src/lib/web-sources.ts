/** Web search results for the think hard verdict, capped the same on client and server. */
import type { WebSource } from "@/types"

export const MAX_SOURCES = 5
export const MAX_SOURCE_TITLE = 200
export const MAX_SOURCE_SNIPPET = 500
export const MAX_SEARCH_QUERY = 400

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

export function sanitizeSources(raw: unknown): WebSource[] {
  if (!Array.isArray(raw)) return []
  const out: WebSource[] = []
  for (const item of raw) {
    if (out.length >= MAX_SOURCES) break
    if (!item || typeof item !== "object") continue
    const { title, url, snippet } = item as Record<string, unknown>
    const safeUrl = httpUrl(url)
    if (!safeUrl) continue
    const safeTitle = typeof title === "string" ? title.trim().slice(0, MAX_SOURCE_TITLE) : ""
    out.push({
      title: safeTitle || new URL(safeUrl).hostname,
      url: safeUrl,
      snippet: typeof snippet === "string" ? snippet.trim().slice(0, MAX_SOURCE_SNIPPET) : "",
    })
  }
  return out
}

/** The latest question as a search query, or null when it is too long or carries a document. */
export function searchQueryFor(text: string): string | null {
  const query = text.trim()
  if (!query || query.length > MAX_SEARCH_QUERY || query.includes("--- File:")) return null
  return query
}
