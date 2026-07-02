import { describe, expect, it } from "vitest"
import { getMissingApiKeyMessage, parseNoKeyProvider } from "@/lib/api-key-errors"

describe("api key error helpers", () => {
  it("recognizes no_key responses with a known provider", () => {
    expect(parseNoKeyProvider({ error: "no_key", provider: "gemini" })).toBe("gemini")
    expect(parseNoKeyProvider({ error: "no_key", provider: "bogus" })).toBeNull()
    expect(parseNoKeyProvider({ error: "other", provider: "gemini" })).toBeNull()
  })

  it("formats the user-facing Settings message", () => {
    expect(getMissingApiKeyMessage("gpt")).toBe(
      "Add your GPT API key in Settings to start debating."
    )
  })
})
