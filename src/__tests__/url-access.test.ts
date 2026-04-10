import { describe, expect, it } from "vitest"
import {
  getUrlCapabilityInstruction,
  hasDirectUrlReference,
  latestUserMessageHasDirectUrl,
  prioritizePerplexity,
  stripExtractedFileBlocks,
} from "@/lib/url-access"
import type { Message } from "@/types"

function makeUserMessage(content: string): Message {
  return {
    id: "user-1",
    sender: "user",
    displayName: "You",
    content,
    timestamp: new Date(),
  }
}

function makeAssistantMessage(content: string): Message {
  return {
    id: "assistant-1",
    sender: "gpt",
    displayName: "GPT",
    content,
    timestamp: new Date(),
  }
}

describe("stripExtractedFileBlocks", () => {
  it("removes extracted file text from the first file marker onward", () => {
    expect(
      stripExtractedFileBlocks("Review this.\n\n--- File: brief.txt ---\nhttps://example.com")
    ).toBe("Review this.\n\n")
  })
})

describe("hasDirectUrlReference", () => {
  it("detects a direct URL in the prompt", () => {
    expect(hasDirectUrlReference("Please check https://example.com/policy")).toBe(true)
  })

  it("stays stable across repeated calls", () => {
    const input = "Please check https://example.com/policy"
    expect(hasDirectUrlReference(input)).toBe(true)
    expect(hasDirectUrlReference(input)).toBe(true)
  })

  it("ignores URLs that only appear inside extracted file text", () => {
    expect(
      hasDirectUrlReference("Summarize this.\n\n--- File: brief.txt ---\nSource: https://example.com/policy")
    ).toBe(false)
  })
})

describe("latestUserMessageHasDirectUrl", () => {
  it("checks only the latest user message", () => {
    expect(
      latestUserMessageHasDirectUrl([
        makeUserMessage("https://example.com/old-link"),
        makeAssistantMessage("I cannot access that link directly."),
        makeUserMessage("Please summarize the attached draft.\n\n--- File: draft.txt ---\nClause 1."),
      ])
    ).toBe(false)
  })
})

describe("getUrlCapabilityInstruction", () => {
  it("lets Perplexity use the web", () => {
    expect(getUrlCapabilityInstruction("perplexity")).toContain("MAY use web search")
  })

  it("blocks direct URL claims for non-Perplexity models", () => {
    expect(getUrlCapabilityInstruction("gpt")).toContain("CANNOT access external URLs")
  })
})

describe("prioritizePerplexity", () => {
  it("moves Perplexity to the front", () => {
    expect(prioritizePerplexity(["gemini", "perplexity", "claude", "gpt"])).toEqual([
      "perplexity",
      "gemini",
      "claude",
      "gpt",
    ])
  })

  it("leaves model order unchanged when Perplexity is absent", () => {
    expect(prioritizePerplexity(["gemini", "claude", "gpt"])).toEqual([
      "gemini",
      "claude",
      "gpt",
    ])
  })
})
