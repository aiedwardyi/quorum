import type { VerdictResult } from "@/types"

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

  if (!Array.isArray(obj.reasons) || obj.reasons.length === 0) {
    throw new Error("reasons must be a non-empty array")
  }

  for (let i = 0; i < obj.reasons.length; i++) {
    if (typeof obj.reasons[i] !== "string") {
      throw new Error(`reasons[${i}] must be a string`)
    }
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

  return {
    recommendedAnswer: obj.recommendedAnswer,
    voteSplit: obj.voteSplit,
    confidence: obj.confidence,
    reasons: obj.reasons as string[],
    minorityView: obj.minorityView,
    oppositeCase: obj.oppositeCase,
    ...(obj.modelAgreement !== undefined ? { modelAgreement: obj.modelAgreement } : {}),
  }
}
