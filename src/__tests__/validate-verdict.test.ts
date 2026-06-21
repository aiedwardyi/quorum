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
    expect(() => validateVerdictResult({ ...validVerdict, recommendedAnswer: "   " })).toThrow(
      "recommendedAnswer"
    )
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
    expect(() => validateVerdictResult({ ...validVerdict, confidence: "high" })).toThrow(
      "confidence"
    )
  })

  it("throws when reasons is empty array", () => {
    expect(() => validateVerdictResult({ ...validVerdict, reasons: [] })).toThrow("reasons")
  })

  it("throws when reasons is empty after coercion (all elements empty objects)", () => {
    expect(() => validateVerdictResult({ ...validVerdict, reasons: [{}, {}] })).toThrow("reasons")
  })

  it("coerces numeric reasons to strings rather than rejecting", () => {
    const result = validateVerdictResult({ ...validVerdict, reasons: [123, "real reason"] })
    expect(result.reasons).toEqual(["123", "real reason"])
  })

  it("coerces {label, text} reason objects to 'label - text' strings", () => {
    // gemini-2.5-pro occasionally wraps each reason in an object
    // shape rather than the plain strings the schema asks for. We
    // flatten the common {label|title, text|description} variants
    // back into strings so the verdict still lands.
    const result = validateVerdictResult({
      ...validVerdict,
      reasons: [
        { label: "Speed", text: "Monoliths ship faster." },
        { title: "Cost", description: "Lower infra bill." },
        "Plain string still works",
      ],
    })
    expect(result.reasons).toEqual([
      "Speed - Monoliths ship faster.",
      "Cost - Lower infra bill.",
      "Plain string still works",
    ])
  })

  it("throws when minorityView is missing", () => {
    const { minorityView: _mv, ...rest } = validVerdict
    expect(() => validateVerdictResult(rest)).toThrow("minorityView")
  })

  it("throws when minorityView is empty", () => {
    expect(() => validateVerdictResult({ ...validVerdict, minorityView: "  " })).toThrow(
      "minorityView"
    )
  })

  it("throws when oppositeCase is missing", () => {
    const { oppositeCase: _oc, ...rest } = validVerdict
    expect(() => validateVerdictResult(rest)).toThrow("oppositeCase")
  })

  it("throws when oppositeCase is empty", () => {
    expect(() => validateVerdictResult({ ...validVerdict, oppositeCase: "" })).toThrow(
      "oppositeCase"
    )
  })

  it("throws when modelAgreement is out of range", () => {
    expect(() => validateVerdictResult({ ...validVerdict, modelAgreement: 150 })).toThrow(
      "modelAgreement"
    )
  })

  it("throws when modelAgreement is not a number", () => {
    expect(() => validateVerdictResult({ ...validVerdict, modelAgreement: "high" })).toThrow(
      "modelAgreement"
    )
  })

  // Optional structured fields
  it("passes with valid analysis string", () => {
    const result = validateVerdictResult({
      ...validVerdict,
      analysis: "Models agreed on the core approach.",
    })
    expect(result.analysis).toBe("Models agreed on the core approach.")
  })

  it("passes without analysis", () => {
    const result = validateVerdictResult(validVerdict)
    expect(result.analysis).toBeUndefined()
  })

  it("throws when analysis is not a string", () => {
    expect(() => validateVerdictResult({ ...validVerdict, analysis: 123 })).toThrow("analysis")
  })

  it("passes with valid keyTakeaways", () => {
    const result = validateVerdictResult({ ...validVerdict, keyTakeaways: ["Point A", "Point B"] })
    expect(result.keyTakeaways).toEqual(["Point A", "Point B"])
  })

  it("passes without keyTakeaways", () => {
    const result = validateVerdictResult(validVerdict)
    expect(result.keyTakeaways).toBeUndefined()
  })

  it("throws when keyTakeaways is not an array", () => {
    expect(() => validateVerdictResult({ ...validVerdict, keyTakeaways: "not array" })).toThrow(
      "keyTakeaways"
    )
  })

  it("coerces {label, text} keyTakeaways objects to strings", () => {
    // This is the exact failure mode that broke live testing.
    // under gemini-2.5-pro: Pro returned keyTakeaways as an array of
    // {label, text} objects instead of strings, and the old strict
    // validator threw "keyTakeaways[0] must be a string" and the UI
    // fell back to "Could not complete analysis".
    const result = validateVerdictResult({
      ...validVerdict,
      keyTakeaways: [
        { label: "Rapid Deployment & Modularity", text: "Wind and solar can be deployed quickly." },
        { title: "Financial Constraints", description: "Upfront costs are staggering." },
      ],
    })
    expect(result.keyTakeaways).toEqual([
      "Rapid Deployment & Modularity - Wind and solar can be deployed quickly.",
      "Financial Constraints - Upfront costs are staggering.",
    ])
  })

  it("stringifies unknown-shape keyTakeaways as a last resort", () => {
    const result = validateVerdictResult({
      ...validVerdict,
      keyTakeaways: [{ weird: "shape", other: 42 }],
    })
    expect(result.keyTakeaways).toHaveLength(1)
    expect(result.keyTakeaways?.[0]).toContain("weird")
  })

  it("drops empty-object keyTakeaways elements during coercion", () => {
    const result = validateVerdictResult({
      ...validVerdict,
      keyTakeaways: ["Keep this", {}, "And this"],
    })
    expect(result.keyTakeaways).toEqual(["Keep this", "And this"])
  })

  it("passes with valid actionItems", () => {
    const result = validateVerdictResult({ ...validVerdict, actionItems: ["Do X", "Do Y"] })
    expect(result.actionItems).toEqual(["Do X", "Do Y"])
  })

  it("passes without actionItems", () => {
    const result = validateVerdictResult(validVerdict)
    expect(result.actionItems).toBeUndefined()
  })

  it("throws when actionItems is not an array", () => {
    expect(() => validateVerdictResult({ ...validVerdict, actionItems: "not array" })).toThrow(
      "actionItems"
    )
  })

  it("coerces {label, text} actionItems objects to strings", () => {
    const result = validateVerdictResult({
      ...validVerdict,
      actionItems: [{ label: "Prototype", text: "Build an MVP this week." }, "Ship it by Friday"],
    })
    expect(result.actionItems).toEqual(["Prototype - Build an MVP this week.", "Ship it by Friday"])
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
