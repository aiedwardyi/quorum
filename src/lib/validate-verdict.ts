import type { VerdictResult } from "@/types"

/**
 * Coerces a verdict-array element into a display string. The schema
 * asks for arrays of plain strings, but gemini-2.5-pro occasionally
 * returns objects like `{ label, text }`, `{ title, description }`,
 * `{ term, explanation }` - it's being "helpful" and over-structuring.
 * Flash complied with the schema; Pro doesn't.
 *
 * Instead of failing validation and dropping the whole verdict, we
 * flatten the common object shapes back into "Label - Description"
 * strings. If the shape is unrecognized, we JSON.stringify as a last
 * resort so the user still gets something readable rather than a
 * "Could not complete analysis" error. Returns null only for truly
 * empty values (null, undefined, empty object).
 */
function coerceToDisplayString(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    // Common Pro patterns: { label|title|term|heading|name, text|description|explanation|detail|content|body }
    const labelKeys = ["label", "title", "term", "heading", "name", "key", "point"]
    const textKeys = ["text", "description", "explanation", "detail", "content", "body", "value", "summary"]
    const label = labelKeys.map((k) => obj[k]).find((v) => typeof v === "string" && (v as string).trim())
    const text = textKeys.map((k) => obj[k]).find((v) => typeof v === "string" && (v as string).trim())
    if (label && text) return `${(label as string).trim()} - ${(text as string).trim()}`
    if (label) return (label as string).trim()
    if (text) return (text as string).trim()
    // Unknown shape - last resort, stringify so the user still sees
    // something rather than losing the whole verdict.
    try {
      const json = JSON.stringify(value)
      return json === "{}" ? null : json
    } catch {
      return null
    }
  }
  return null
}

function coerceStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }
  const out: string[] = []
  for (let i = 0; i < value.length; i++) {
    const coerced = coerceToDisplayString(value[i])
    if (coerced !== null) out.push(coerced)
  }
  return out
}

export function validateVerdictResult(raw: unknown): VerdictResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Verdict response is not an object")
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.recommendedAnswer !== "string" || !obj.recommendedAnswer.trim()) {
    throw new Error("recommendedAnswer must be a non-empty string")
  }

  if (typeof obj.voteSplit !== "string" || !obj.voteSplit.trim()) {
    throw new Error("voteSplit must be a non-empty string")
  }

  if (typeof obj.confidence !== "number" || !Number.isFinite(obj.confidence) || obj.confidence < 0 || obj.confidence > 100) {
    throw new Error("confidence must be a finite number between 0 and 100")
  }

  // reasons, keyTakeaways, and actionItems are all "array of strings"
  // in the schema but Pro sometimes returns objects per element. We
  // coerce known {label, text}-ish shapes back into strings rather
  // than throwing - see coerceToDisplayString for the rationale.
  const reasons = coerceStringArray(obj.reasons, "reasons")
  if (reasons.length === 0) {
    throw new Error("reasons must be a non-empty array")
  }

  if (typeof obj.minorityView !== "string" || !obj.minorityView.trim()) {
    throw new Error("minorityView must be a non-empty string")
  }

  if (typeof obj.oppositeCase !== "string" || !obj.oppositeCase.trim()) {
    throw new Error("oppositeCase must be a non-empty string")
  }

  if (obj.modelAgreement !== undefined) {
    if (typeof obj.modelAgreement !== "number" || !Number.isFinite(obj.modelAgreement) || obj.modelAgreement < 0 || obj.modelAgreement > 100) {
      throw new Error("modelAgreement must be a finite number between 0 and 100")
    }
  }

  // Validate optional structured fields
  if (obj.analysis !== undefined && typeof obj.analysis !== "string") {
    throw new Error("analysis must be a string")
  }

  const keyTakeaways =
    obj.keyTakeaways !== undefined ? coerceStringArray(obj.keyTakeaways, "keyTakeaways") : undefined

  const actionItems =
    obj.actionItems !== undefined ? coerceStringArray(obj.actionItems, "actionItems") : undefined

  return {
    recommendedAnswer: obj.recommendedAnswer,
    voteSplit: obj.voteSplit,
    confidence: obj.confidence,
    reasons,
    minorityView: obj.minorityView,
    oppositeCase: obj.oppositeCase,
    ...(obj.modelAgreement !== undefined ? { modelAgreement: obj.modelAgreement } : {}),
    ...(typeof obj.analysis === "string" ? { analysis: obj.analysis } : {}),
    ...(keyTakeaways !== undefined ? { keyTakeaways } : {}),
    ...(actionItems !== undefined ? { actionItems } : {}),
  }
}
