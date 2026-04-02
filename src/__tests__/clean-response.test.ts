import { describe, it, expect } from "vitest"
import { cleanResponse } from "@/lib/clean-response"

describe("cleanResponse", () => {
  it("strips inline citation markers", () => {
    expect(cleanResponse("This is great[1] and also good[2][3].")).toBe(
      "This is great and also good."
    )
  })

  it("strips grouped citation markers", () => {
    expect(cleanResponse("Result[1][4][5] confirmed.")).toBe("Result confirmed.")
  })

  it("strips trailing References block", () => {
    const input = "Great answer.\n\nReferences:\n1. Source A\n2. Source B"
    expect(cleanResponse(input)).toBe("Great answer.")
  })

  it("strips trailing Refs block", () => {
    const input = "Good point.\n\n--- Refs:\n- Link 1"
    expect(cleanResponse(input)).toBe("Good point.")
  })

  it("strips trailing Sources block", () => {
    const input = "Nice.\n\nSources:\n1. Foo"
    expect(cleanResponse(input)).toBe("Nice.")
  })

  it("cleans double spaces left behind", () => {
    expect(cleanResponse("Hello  world  test")).toBe("Hello world test")
  })

  it("handles empty string", () => {
    expect(cleanResponse("")).toBe("")
  })

  it("handles string with only whitespace", () => {
    expect(cleanResponse("   ")).toBe("")
  })

  it("preserves text with no citations", () => {
    const input = "This is a normal response with no issues."
    expect(cleanResponse(input)).toBe(input)
  })

  it("handles case-insensitive References", () => {
    const input = "Answer.\n\nrEfErEnCeS:\n1. Foo"
    expect(cleanResponse(input)).toBe("Answer.")
  })
})
