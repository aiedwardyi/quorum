import { describe, expect, it } from "vitest"
import {
  getApiKeyPromptMessage,
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

describe("getApiKeyPromptMessage", () => {
  it("shows a generic first-run welcome when the visitor is keyless", () => {
    expect(getApiKeyPromptMessage("perplexity", true)).toBe(
      "Add your first API key in Settings to start debating."
    )
  })

  it("invites sign-in for a free debate when auth is on and visitor is signed out", () => {
    expect(
      getApiKeyPromptMessage("perplexity", true, "en", { authOn: true, signedIn: false })
    ).toBe("Sign in with Google for 1 free debate, or add an API key in Settings.")
  })

  it("tells signed-in users the free debate is used", () => {
    expect(getApiKeyPromptMessage("perplexity", true, "en", { authOn: true, signedIn: true })).toBe(
      "Free debate used. Add an API key in Settings to continue."
    )
  })

  it("ignores the provider when keyless (rotation order should not leak)", () => {
    expect(getApiKeyPromptMessage("perplexity", true)).toBe(getApiKeyPromptMessage("gpt", true))
  })

  it("names the specific provider when the visitor already has a key", () => {
    expect(getApiKeyPromptMessage("gemini", false)).toBe(
      "Add your Gemini API key in Settings to start debating."
    )
  })

  it("localizes both branches to Korean", () => {
    expect(getApiKeyPromptMessage("perplexity", true, "ko")).toBe(
      "Settings에서 첫 API 키를 추가해 토론을 시작하세요."
    )
    expect(getApiKeyPromptMessage("gemini", false, "ko")).toBe(
      "Settings에서 Gemini API 키를 추가해 토론을 시작하세요."
    )
  })
})
