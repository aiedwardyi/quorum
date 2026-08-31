/** Parse Vertex ADC JSON, including unquoted multiline values Next dotenv truncates. */
import { readFileSync } from "node:fs"
import { join } from "node:path"

export const VERTEX_CREDENTIALS_JSON_ERROR =
  "Vertex credentials JSON is invalid or truncated. Put GOOGLE_APPLICATION_CREDENTIALS_JSON on one line or wrap the JSON in single quotes."

export function parseServiceAccountJson(raw: string): Record<string, unknown> {
  const attempts = [raw, raw.trim()]
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
  ) {
    attempts.push(trimmed.slice(1, -1))
  }
  for (const attempt of attempts) {
    try {
      const parsed: unknown = JSON.parse(attempt)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      continue
    }
  }
  throw new Error(VERTEX_CREDENTIALS_JSON_ERROR)
}

/** Pull a KEY= value from dotenv text, including unquoted `{ ... }` JSON blocks. */
export function extractEnvValue(fileText: string, key: string): string | undefined {
  const keyRe = new RegExp(`^${key}\\s*=\\s*`, "m")
  const match = keyRe.exec(fileText)
  if (!match) return undefined
  let i = match.index + match[0].length
  if (i >= fileText.length) return undefined

  const quote = fileText[i]
  if (quote === "'" || quote === '"') {
    i += 1
    let value = ""
    while (i < fileText.length) {
      const ch = fileText[i]
      if (ch === quote) return value
      if (ch === "\\" && quote === '"' && i + 1 < fileText.length) {
        value += fileText[i + 1]
        i += 2
        continue
      }
      value += ch
      i += 1
    }
    return value
  }

  if (fileText[i] === "{") {
    let depth = 0
    let inString = false
    let escape = false
    const start = i
    for (; i < fileText.length; i++) {
      const ch = fileText[i]
      if (inString) {
        if (escape) {
          escape = false
          continue
        }
        if (ch === "\\") {
          escape = true
          continue
        }
        if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === "{") depth += 1
      else if (ch === "}") {
        depth -= 1
        if (depth === 0) return fileText.slice(start, i + 1)
      }
    }
    return undefined
  }

  const end = fileText.indexOf("\n", i)
  return fileText.slice(i, end === -1 ? undefined : end).trimEnd()
}

export function resolveGoogleApplicationCredentialsJson(
  envValue: string | undefined,
  fileContents: string[] = []
): Record<string, unknown> | undefined {
  const trimmed = envValue?.trim()
  if (!trimmed) return undefined
  try {
    return parseServiceAccountJson(trimmed)
  } catch (err) {
    if (trimmed !== "{") throw err
    for (const file of fileContents) {
      const extracted = extractEnvValue(file, "GOOGLE_APPLICATION_CREDENTIALS_JSON")
      if (!extracted?.trim()) continue
      try {
        return parseServiceAccountJson(extracted)
      } catch {
        continue
      }
    }
    throw err
  }
}

export function loadGoogleApplicationCredentialsJson(): Record<string, unknown> | undefined {
  const files: string[] = []
  for (const name of [".env.local", ".env"]) {
    try {
      files.push(readFileSync(join(process.cwd(), name), "utf8"))
    } catch {
      // File is optional.
    }
  }
  return resolveGoogleApplicationCredentialsJson(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
    files
  )
}
