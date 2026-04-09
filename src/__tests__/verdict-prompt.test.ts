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

  // Response length schema tests
  it("short schema does not include keyTakeaways or analysis or actionItems", () => {
    const prompt = getVerdictPrompt("en", "short")
    expect(prompt).not.toContain("keyTakeaways")
    expect(prompt).not.toContain("analysis")
    expect(prompt).not.toContain("actionItems")
  })

  it("medium schema includes keyTakeaways but not analysis or actionItems", () => {
    const prompt = getVerdictPrompt("en", "medium")
    expect(prompt).toContain("keyTakeaways")
    expect(prompt).not.toContain('"analysis"')
    expect(prompt).not.toContain('"actionItems"')
  })

  it("long schema includes analysis, keyTakeaways, and actionItems", () => {
    const prompt = getVerdictPrompt("en", "long")
    expect(prompt).toContain("analysis")
    expect(prompt).toContain("keyTakeaways")
    expect(prompt).toContain("actionItems")
  })

  it("Korean locale rule for short lists only base fields", () => {
    const prompt = getVerdictPrompt("ko", "short")
    expect(prompt).toContain("in Korean")
    expect(prompt).not.toContain("keyTakeaways")
  })

  it("Korean locale rule for long lists all fields", () => {
    const prompt = getVerdictPrompt("ko", "long")
    expect(prompt).toContain("analysis")
    expect(prompt).toContain("keyTakeaways")
    expect(prompt).toContain("actionItems")
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
