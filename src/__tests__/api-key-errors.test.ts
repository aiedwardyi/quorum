import { describe, expect, it } from "vitest"
import {
  getMissingApiKeyMessage,
  parseNoKeyProvider,
  parseNoKeyProviderFromResponse,
} from "@/lib/api-key-errors"

describe("api key error helpers", () => {
  it("recognizes no_key responses with a known provider", () => {
    expect(parseNoKeyProvider({ error: "no_key", provider: "gemini" })).toBe("gemini")
    expect(parseNoKeyProvider({ error: "no_key", provider: "bogus" })).toBeNull()
    expect(parseNoKeyProvider({ error: "other", provider: "gemini" })).toBeNull()
  })

  it("returns null for malformed no_key payloads", () => {
    expect(parseNoKeyProvider(null)).toBeNull()
    expect(parseNoKeyProvider(undefined)).toBeNull()
    expect(parseNoKeyProvider("no_key")).toBeNull()
    expect(parseNoKeyProvider({ error: "no_key" })).toBeNull()
    expect(parseNoKeyProvider({ error: "no_key", provider: 123 })).toBeNull()
  })

  it("parses no_key provider from a response body", async () => {
    const response = Response.json({ error: "no_key", provider: "claude" }, { status: 402 })

    await expect(parseNoKeyProviderFromResponse(response)).resolves.toBe("claude")
  })

  it("returns null when response JSON parsing fails", async () => {
    const response = new Response("{", {
      status: 402,
      headers: { "Content-Type": "application/json" },
    })

    await expect(parseNoKeyProviderFromResponse(response)).resolves.toBeNull()
  })

  it("formats the user-facing Settings message", () => {
    expect(getMissingApiKeyMessage("gpt")).toBe(
      "Add your GPT API key in Settings to start debating."
    )
  })

  it("formats the Settings message in Korean", () => {
    expect(getMissingApiKeyMessage("gemini", "ko")).toBe(
      "Settings에서 Gemini API 키를 추가해 토론을 시작하세요."
    )
  })
})
