import { describe, it, expect } from "vitest"
import { getVerdictPrompt } from "@/lib/verdict-prompt"

describe("getVerdictPrompt", () => {
  it("returns a non-empty string for English", () => {
    const prompt = getVerdictPrompt("en")
    expect(prompt.length).toBeGreaterThan(0)
  })

  it("returns a non-empty string for Korean", () => {
    const prompt = getVerdictPrompt("ko")
    expect(prompt.length).toBeGreaterThan(0)
  })

  it("contains key schema fields", () => {
    const prompt = getVerdictPrompt("en")
    expect(prompt).toContain("recommendedAnswer")
    expect(prompt).toContain("voteSplit")
    expect(prompt).toContain("confidence")
    expect(prompt).toContain("reasons")
    expect(prompt).toContain("minorityView")
    expect(prompt).toContain("oppositeCase")
  })

  it("instructs decisive behavior", () => {
    const prompt = getVerdictPrompt("en")
    expect(prompt).toContain("decisive")
    expect(prompt).toContain("decision advisor")
  })

  it("prohibits hedging language", () => {
    const prompt = getVerdictPrompt("en")
    expect(prompt).toContain("it depends")
    expect(prompt).toContain("both have merits")
  })

  it("includes Korean locale rule for ko", () => {
    const prompt = getVerdictPrompt("ko")
    expect(prompt).toContain("Korean")
  })

  it("does not include Korean locale rule for en", () => {
    const prompt = getVerdictPrompt("en")
    expect(prompt).not.toContain("in Korean")
  })
})
