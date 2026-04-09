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

  // Validate optional structured fields
  if (obj.analysis !== undefined && typeof obj.analysis !== "string") {
    throw new Error("analysis must be a string")
  }

  if (obj.keyTakeaways !== undefined) {
    if (!Array.isArray(obj.keyTakeaways)) {
      throw new Error("keyTakeaways must be an array")
    }
    for (let i = 0; i < obj.keyTakeaways.length; i++) {
      if (typeof obj.keyTakeaways[i] !== "string") {
        throw new Error(`keyTakeaways[${i}] must be a string`)
      }
    }
  }

  if (obj.actionItems !== undefined) {
    if (!Array.isArray(obj.actionItems)) {
      throw new Error("actionItems must be an array")
    }
    for (let i = 0; i < obj.actionItems.length; i++) {
      if (typeof obj.actionItems[i] !== "string") {
        throw new Error(`actionItems[${i}] must be a string`)
      }
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
    ...(typeof obj.analysis === "string" ? { analysis: obj.analysis } : {}),
    ...(Array.isArray(obj.keyTakeaways) ? { keyTakeaways: obj.keyTakeaways as string[] } : {}),
    ...(Array.isArray(obj.actionItems) ? { actionItems: obj.actionItems as string[] } : {}),
  }
}
