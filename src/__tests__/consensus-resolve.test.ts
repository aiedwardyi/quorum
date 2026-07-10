/** Unit tests for consensus provider order and human error copy. */
import { describe, expect, it } from "vitest"
import {
  buildConsensusProviderOrder,
  humanVerdictError,
  NO_CONSENSUS_KEY_MESSAGE,
} from "@/lib/consensus-resolve"

describe("buildConsensusProviderOrder", () => {
  it("prefers structured debate models, then fills set, Perplexity always last", () => {
    expect(buildConsensusProviderOrder(["claude", "perplexity", "gpt"])).toEqual([
      "claude",
      "gpt",
      "gemini",
      "perplexity",
    ])
  })

  it("defaults to gemini, claude, gpt, then perplexity", () => {
    expect(buildConsensusProviderOrder(undefined)).toEqual([
      "gemini",
      "claude",
      "gpt",
      "perplexity",
    ])
  })
})

describe("humanVerdictError", () => {
  it("maps timeouts to plain language", () => {
    expect(humanVerdictError(new Error("Verdict generation timed out"))).toMatch(/too long/i)
  })

  it("maps rate limits to plain language", () => {
    expect(humanVerdictError(new Error("429 resource_exhausted"))).toMatch(/rate limit/i)
  })

  it("does not treat generate as a rate limit", () => {
    expect(humanVerdictError(new Error("failed to generate verdict"))).not.toMatch(/rate limit/i)
  })

  it("localizes Korean timeouts", () => {
    expect(humanVerdictError(new Error("timed out"), "ko")).toMatch(/오래/)
  })

  it("exports a clear missing-key message", () => {
    expect(NO_CONSENSUS_KEY_MESSAGE).toMatch(/API key/i)
  })
})
