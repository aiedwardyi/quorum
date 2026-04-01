import { describe, it, expect } from "vitest"
import { validateVerdictResult } from "@/lib/validate-verdict"

const validVerdict = {
  recommendedAnswer: "Use a monolith for your MVP.",
  voteSplit: "Gemini, Claude, GPT chose monolith / Perplexity chose microservices",
  confidence: 85,
  reasons: ["Faster to ship", "Easier to debug", "Lower infrastructure cost"],
  minorityView: "Microservices allow independent scaling if teams are large.",
  oppositeCase: "When you have 5+ teams that must deploy independently from day one.",
  modelAgreement: 90,
}

describe("validateVerdictResult", () => {
  it("passes with a valid complete result", () => {
    const result = validateVerdictResult(validVerdict)
    expect(result.recommendedAnswer).toBe(validVerdict.recommendedAnswer)
    expect(result.confidence).toBe(85)
    expect(result.reasons).toHaveLength(3)
    expect(result.modelAgreement).toBe(90)
  })

  it("passes when modelAgreement is absent", () => {
    const { modelAgreement: _ma, ...withoutAgreement } = validVerdict
    const result = validateVerdictResult(withoutAgreement)
    expect(result.modelAgreement).toBeUndefined()
  })

  it("silently ignores extra unknown fields", () => {
    const result = validateVerdictResult({ ...validVerdict, extraField: "hello" })
    expect(result.recommendedAnswer).toBe(validVerdict.recommendedAnswer)
    expect((result as Record<string, unknown>).extraField).toBeUndefined()
  })

  it("throws when input is null", () => {
    expect(() => validateVerdictResult(null)).toThrow("not an object")
  })

  it("throws when input is not an object", () => {
    expect(() => validateVerdictResult("string")).toThrow("not an object")
  })

  it("throws when recommendedAnswer is missing", () => {
    const { recommendedAnswer: _ra, ...rest } = validVerdict
    expect(() => validateVerdictResult(rest)).toThrow("recommendedAnswer")
  })

  it("throws when recommendedAnswer is empty", () => {
    expect(() => validateVerdictResult({ ...validVerdict, recommendedAnswer: "   " })).toThrow("recommendedAnswer")
  })

  it("throws when voteSplit is missing", () => {
    const { voteSplit: _vs, ...rest } = validVerdict
    expect(() => validateVerdictResult(rest)).toThrow("voteSplit")
  })

  it("throws when voteSplit is empty", () => {
    expect(() => validateVerdictResult({ ...validVerdict, voteSplit: "" })).toThrow("voteSplit")
  })

  it("throws when confidence is negative", () => {
    expect(() => validateVerdictResult({ ...validVerdict, confidence: -1 })).toThrow("confidence")
  })

  it("throws when confidence is over 100", () => {
    expect(() => validateVerdictResult({ ...validVerdict, confidence: 101 })).toThrow("confidence")
  })

  it("throws when confidence is NaN", () => {
    expect(() => validateVerdictResult({ ...validVerdict, confidence: NaN })).toThrow("confidence")
  })

  it("throws when confidence is not a number", () => {
    expect(() => validateVerdictResult({ ...validVerdict, confidence: "high" })).toThrow("confidence")
  })

  it("throws when reasons is empty array", () => {
    expect(() => validateVerdictResult({ ...validVerdict, reasons: [] })).toThrow("reasons")
  })

  it("throws when reasons contains non-string", () => {
    expect(() => validateVerdictResult({ ...validVerdict, reasons: [123] })).toThrow("reasons[0]")
  })

  it("throws when minorityView is missing", () => {
    const { minorityView: _mv, ...rest } = validVerdict
    expect(() => validateVerdictResult(rest)).toThrow("minorityView")
  })

  it("throws when oppositeCase is missing", () => {
    const { oppositeCase: _oc, ...rest } = validVerdict
    expect(() => validateVerdictResult(rest)).toThrow("oppositeCase")
  })

  it("throws when modelAgreement is out of range", () => {
    expect(() => validateVerdictResult({ ...validVerdict, modelAgreement: 150 })).toThrow("modelAgreement")
  })

  it("throws when modelAgreement is not a number", () => {
    expect(() => validateVerdictResult({ ...validVerdict, modelAgreement: "high" })).toThrow("modelAgreement")
  })

  it("accepts confidence at boundary 0", () => {
    const result = validateVerdictResult({ ...validVerdict, confidence: 0 })
    expect(result.confidence).toBe(0)
  })

  it("accepts confidence at boundary 100", () => {
    const result = validateVerdictResult({ ...validVerdict, confidence: 100 })
    expect(result.confidence).toBe(100)
  })
})
