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

const HEDGING_PHRASES = ["it depends", "both have merits", "there is no clear winner", "hard to say"]

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
      {
        error: "Failed to generate verdict",
        ...(process.env.NODE_ENV === "development" ? { detail: message } : {}),
      },
      { status: 500 }
    )
  }
}
