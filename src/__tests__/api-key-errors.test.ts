import { describe, expect, it } from "vitest"
import {
  getApiKeyPromptMessage,
  getBudgetExceededMessage,
  getMissingApiKeyMessage,
  parse402Payload,
  parse402FromResponse,
} from "@/lib/api-key-errors"

describe("api key error helpers", () => {
  it("classifies no_key responses and keeps a known provider", () => {
    expect(parse402Payload({ error: "no_key", provider: "gemini" })).toEqual({
      kind: "no_key",
      provider: "gemini",
    })
    expect(parse402Payload({ error: "no_key", provider: "bogus" })).toEqual({
      kind: "no_key",
      provider: null,
    })
    expect(parse402Payload({ error: "other", provider: "gemini" })).toBeNull()
  })

  it("classifies host_budget_exceeded responses", () => {
    expect(parse402Payload({ error: "host_budget_exceeded", provider: "claude" })).toEqual({
      kind: "host_budget_exceeded",
      provider: "claude",
    })
  })

  it("returns null for malformed payloads", () => {
    expect(parse402Payload(null)).toBeNull()
    expect(parse402Payload(undefined)).toBeNull()
    expect(parse402Payload("no_key")).toBeNull()
    expect(parse402Payload({ error: "no_key" })).toEqual({ kind: "no_key", provider: null })
    expect(parse402Payload({ error: "no_key", provider: 123 })).toEqual({
      kind: "no_key",
      provider: null,
    })
  })

  it("parses a 402 body from a response", async () => {
    const response = Response.json({ error: "no_key", provider: "claude" }, { status: 402 })

    await expect(parse402FromResponse(response)).resolves.toEqual({
      kind: "no_key",
      provider: "claude",
    })
  })

  it("returns null when response JSON parsing fails", async () => {
    const response = new Response("{", {
      status: 402,
      headers: { "Content-Type": "application/json" },
    })

    await expect(parse402FromResponse(response)).resolves.toBeNull()
  })

  it("keeps the free debate promise honest at the budget wall", () => {
    expect(getBudgetExceededMessage(true)).toContain("yours is safe for tomorrow")
    expect(getBudgetExceededMessage(false)).toContain("come back tomorrow")
    expect(getBudgetExceededMessage(true, "ko")).toContain("무료 토론은 그대로")
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
