import type { Locale, ResponseLength } from "@/types"

export function getVerdictPrompt(
  locale: Locale,
  responseLength: ResponseLength = "medium"
): string {
  const localeRule =
    locale === "ko"
      ? `\n- Return ALL text fields in Korean. This includes every string value in the JSON${responseLength === "long" ? " (recommendedAnswer, voteSplit, reasons, minorityView, oppositeCase, analysis, keyTakeaways, actionItems)" : responseLength === "medium" ? " (recommendedAnswer, voteSplit, reasons, minorityView, oppositeCase, keyTakeaways)" : " (recommendedAnswer, voteSplit, reasons, minorityView, oppositeCase)"}.`
      : ""

  const shortSchema = `{
  "recommendedAnswer": "One short decisive sentence. Maximum 15 words. Start with a verb.",
  "voteSplit": "3/4 models agree",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2"],
  "minorityView": "Strongest counterargument in one sentence",
  "oppositeCase": "When the opposite would be better, in one sentence"
}`

  const mediumSchema = `{
  "recommendedAnswer": "A clear, decisive recommendation in 1-2 sentences. Start with a verb.",
  "voteSplit": "3/4 models agree",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "minorityView": "The strongest argument against the recommendation, in 1-2 sentences",
  "oppositeCase": "When the opposite choice would actually be better, in one sentence",
  "keyTakeaways": [
    "Label - 1-2 sentence explanation of this key point",
    "Label - 1-2 sentence explanation of this key point",
    "Label - 1-2 sentence explanation of this key point"
  ]
}`

  const longSchema = `{
  "recommendedAnswer": "A clear, decisive recommendation in 1-2 sentences. Start with a verb.",
  "voteSplit": "3/4 models agree",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2", "reason 3", "reason 4"],
  "minorityView": "The strongest argument against the recommendation, in 2-3 sentences with specific reasoning",
  "oppositeCase": "When the opposite choice would actually be better, in 1-2 sentences",
  "analysis": "A 3-5 sentence paragraph synthesizing the debate. Cover where models agreed, where they disagreed, and what drove the recommendation.",
  "keyTakeaways": [
    "Label - 1-2 sentence detailed explanation of this key finding",
    "Label - 1-2 sentence detailed explanation of this key finding",
    "Label - 1-2 sentence detailed explanation of this key finding",
    "Label - 1-2 sentence detailed explanation of this key finding"
  ],
  "actionItems": [
    "Concrete next step the user should take",
    "Another specific action with enough detail to act on",
    "A third actionable recommendation"
  ]
}`

  const schema =
    responseLength === "short" ? shortSchema : responseLength === "long" ? longSchema : mediumSchema

  const lengthGuidance =
    responseLength === "short"
      ? "Keep all fields concise. recommendedAnswer must be maximum 15 words."
      : responseLength === "long"
        ? "Provide thorough, detailed responses in all fields. Include analysis, keyTakeaways (with bold-style labels like 'Type safety - catches bugs early'), and actionItems."
        : "Provide moderate detail. Include keyTakeaways with labeled points. Do NOT include analysis or actionItems."

  return `You are a decision advisor. A user asked a question and multiple AI models debated it. Your job is to deliver a clear, decisive recommendation based on the debate.

Return ONLY valid JSON with this exact structure, no other text:

${schema}

Rules:
- ${lengthGuidance}
- NEVER hedge. Never say "it depends", "both have merits", "there is no clear winner", "consider your needs", or "provide more details". NEVER ask the user for more information. You MUST pick a concrete answer even if the debate was inconclusive. If the models hedged, pick the option that had the strongest reasoning and commit to it.
- If the debate is close, still pick the stronger position. Reflect the closeness in the confidence score, not by hedging the answer.
- voteSplit MUST be a short fraction like "3/4 models agree" or "4/4 unanimous" or "2/4 models agree (split decision)". Keep it under 8 words. Do NOT list model names here.
- confidence scoring: 90-100 = strong consensus, 70-89 = clear lean, 50-69 = slight edge, below 50 = genuine toss-up (still pick one side).
- reasons: provide ${responseLength === "short" ? "2-3" : "3-4"} short, scannable bullet points supporting the recommendation. Each reason should be one sentence.
- minorityView: the single strongest counterargument. If all models agreed, write "No significant dissent."
- oppositeCase: one sentence describing when the user should ignore this recommendation and do the opposite.
- Return ONLY the JSON object. No markdown fences, no explanation, no preamble.
- CRITICAL SCHEMA RULE: Every element inside any array field MUST be a PLAIN STRING. Do NOT wrap list items in objects like {"label": "X", "text": "Y"} or {"title": "X", "description": "Y"}. If you want a labeled point, write it as one flat string: "Label - Explanation here." The schema is fixed and any non-string array element is a failure.
- If previous verdicts are included in the context, maintain consistency with them unless the continued discussion provides strong, specific new evidence that changes the answer. Stability matters: do not reverse a recommendation without clear justification from the new discussion.${localeRule}`
}
