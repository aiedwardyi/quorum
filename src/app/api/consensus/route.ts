import { NextRequest, NextResponse } from "next/server"
import type { Message, Locale } from "@/types"
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"
import { getVertexConfig } from "@/lib/vertex-config"
import { validateVerdictResult } from "@/lib/validate-verdict"
import { getVerdictPrompt } from "@/lib/verdict-prompt"

const HEDGING_PHRASES = [
  "it depends",
  "both have merits",
  "there is no clear winner",
  "hard to say",
  "provide more details",
  "provide more information",
  "consider your needs",
  "depends on your needs",
  "자세한 정보를 제공",
  "필요를 고려",
]

const MAX_MESSAGE_CHARS = 2000

function stripFileContent(content: string): string {
  const fileMarker = "--- File:"
  const idx = content.indexOf(fileMarker)
  if (idx >= 0) {
    const question = content.slice(0, idx).trim()
    return question || "[File uploaded without question]"
  }
  if (content.length > MAX_MESSAGE_CHARS) {
    return content.slice(0, MAX_MESSAGE_CHARS) + "\n[...truncated]"
  }
  return content
}

function formatThread(messages: Message[]): string {
  return messages
    .map((m) => {
      const content = m.sender === "user" ? stripFileContent(m.content) : m.content
      return `[${m.displayName}]: ${content}`
    })
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

    const discussionMessages = messages.filter((m) => m.sender !== "system" && m.sender !== "verdict")

    // Extract previous verdict recommendations for context
    const previousVerdicts = messages
      .filter((m) => m.sender === "verdict")
      .map((m) => m.content)

    const aiMessages = discussionMessages.filter((m) => m.sender !== "user")
    if (aiMessages.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 AI messages to generate verdict" },
        { status: 400 }
      )
    }

    const thread = formatThread(discussionMessages)

    const { projectId, location } = getVertexConfig()
    const opts: ConstructorParameters<typeof VertexAI>[0] = { project: projectId, location }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      opts.googleAuthOptions = {
        credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
      }
    }
    const vertexAI = new VertexAI(opts)
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

    const VERDICT_TIMEOUT_MS = 30_000
    const result = await Promise.race([
      model.generateContent({
        systemInstruction: {
          role: "system",
          parts: [{ text: getVerdictPrompt(locale) }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Here is the discussion to analyze:\n\n${thread}${previousVerdicts.length > 0
                  ? `\n\nPrevious verdict(s) from earlier rounds of this discussion:\n${previousVerdicts.map((v, i) => `- Round ${i + 1} verdict: ${JSON.stringify(v)}`).join("\n")}\n\nThe user continued the discussion after the above verdict(s). Analyze the NEW discussion carefully. Only change the recommendation if there is strong, specific new evidence. Do NOT flip-flop without justification.`
                  : ""}`,
              },
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Verdict generation timed out")), VERDICT_TIMEOUT_MS)
      ),
    ])

    const raw =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    if (!raw) {
      throw new Error("Gemini returned an empty response")
    }

    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim()

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch (jsonErr) {
      // Gemini sometimes returns malformed JSON - retry once with repair prompt
      console.warn(`[verdict] JSON parse failed, retrying: ${jsonErr instanceof Error ? jsonErr.message : jsonErr}`)
      const retryResult = await Promise.race([
        model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: `The following JSON is malformed. Fix it and return ONLY valid JSON, no other text:\n\n${cleaned}` }],
            },
          ],
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("JSON retry timed out")), 15_000)
        ),
      ])
      const retryRaw = retryResult.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
      const retryCleaned = retryRaw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
      parsed = JSON.parse(retryCleaned)
    }

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
      {
        error: "Failed to generate verdict",
        ...(process.env.NODE_ENV === "development" ? { detail: message } : {}),
      },
      { status: 500 }
    )
  }
}
