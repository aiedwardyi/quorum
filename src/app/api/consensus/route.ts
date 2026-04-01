import { NextRequest, NextResponse } from "next/server"
import type { Message, Locale } from "@/types"
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"
import { getVertexConfig } from "@/lib/vertex-config"
import { validateVerdictResult } from "@/lib/validate-verdict"

const HEDGING_PHRASES = ["it depends", "both have merits", "there is no clear winner", "hard to say"]

export function getVerdictPrompt(locale: Locale): string {
  const localeRule = locale === "ko"
    ? "\n- Return ALL text fields (recommendedAnswer, voteSplit, reasons, minorityView, oppositeCase) in Korean."
    : ""

  return `You are a decision advisor. A user asked a question and multiple AI models debated it. Your job is to deliver a clear, decisive recommendation based on the debate.

Return ONLY valid JSON with this exact structure, no other text:

{
  "recommendedAnswer": "Clear, actionable recommendation in 1-2 sentences. Start with a verb: Do X, Choose X, Use X.",
  "voteSplit": "Which models supported which position, e.g. 'Gemini, Claude, GPT chose X / Perplexity chose Y' or '4/4 unanimous for X'",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "minorityView": "The strongest argument against the recommendation, in one sentence",
  "oppositeCase": "When the opposite choice would actually be better, in one sentence",
  "modelAgreement": <number 0-100>
}

Rules:
- recommendedAnswer MUST be decisive. Start with an action verb. Never say "it depends", "both have merits", or "there is no clear winner".
- If the debate is close, still pick the stronger position. Reflect the closeness in the confidence score, not by hedging the answer.
- voteSplit MUST reference the actual model names from the conversation (e.g. Gemini, Perplexity, Claude, GPT). State which models supported which position.
- confidence scoring: 90-100 = strong consensus, 70-89 = clear lean, 50-69 = slight edge, below 50 = genuine toss-up (still pick one side).
- reasons: provide 2-4 short, scannable bullet points supporting the recommendation.
- minorityView: the single strongest counterargument. If all models agreed, write "No significant dissent."
- oppositeCase: one sentence describing when the user should ignore this recommendation and do the opposite.
- modelAgreement: 0-100 score for how aligned the models were with each other (separate from confidence in the recommendation).
- Return ONLY the JSON object. No markdown fences, no explanation, no preamble.${localeRule}`
}

function formatThread(messages: Message[]): string {
  return messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json()
    const messages: Message[] = body.messages
    const rawLocale = body.locale
    const locale: Locale = rawLocale === "en" || rawLocale === "ko" ? rawLocale : "en"

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      )
    }

    const discussionMessages = messages.filter((message) => message.sender !== "system")

    const aiMessages = discussionMessages.filter((m) => m.sender !== "user")
    if (aiMessages.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 AI messages to generate verdict" },
        { status: 400 }
      )
    }

    const thread = formatThread(discussionMessages)

    const { projectId, location } = getVertexConfig()
    const vertexAI = new VertexAI({ project: projectId, location })
    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    })

    console.log(`[verdict] Generating verdict for ${aiMessages.length} AI messages, locale=${locale}`)

    const result = await model.generateContent({
      systemInstruction: {
        role: "system",
        parts: [{ text: getVerdictPrompt(locale) }],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Here is the discussion to analyze:\n\n${thread}`,
            },
          ],
        },
      ],
    })

    const raw =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    if (!raw) {
      throw new Error("Gemini returned an empty response")
    }

    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim()

    const parsed = JSON.parse(cleaned)
    const verdict = validateVerdictResult(parsed)

    const elapsed = Date.now() - startTime
    console.log(`[verdict] Generated in ${elapsed}ms, confidence=${verdict.confidence}`)

    if (HEDGING_PHRASES.some((phrase) => verdict.recommendedAnswer.toLowerCase().includes(phrase))) {
      console.warn(`[verdict] Hedging detected in recommendedAnswer: "${verdict.recommendedAnswer}"`)
    }

    return NextResponse.json(verdict)
  } catch (error) {
    const elapsed = Date.now() - startTime
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`[verdict] Failed after ${elapsed}ms:`, message)
    return NextResponse.json(
      { error: "Failed to generate verdict", detail: message },
      { status: 500 }
    )
  }
}
