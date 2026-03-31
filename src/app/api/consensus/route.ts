import { NextRequest, NextResponse } from "next/server"
import type { Message, ConsensusResult, Locale } from "@/types"
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"
import { getVertexConfig } from "@/lib/vertex-config"

function getConsensusPrompt(locale: Locale): string {
  const localeRule = locale === "ko"
    ? "\n- Return all text fields (agreements, disagreements, summary) in Korean."
    : ""

  return `You are a discussion analyst. Analyze the following group discussion between AI models and a human user.

Evaluate how much the participants agree with each other. Return ONLY valid JSON with this exact structure, no other text:

{
  "score": <number 0-100, where 100 = full agreement>,
  "agreements": ["point 1", "point 2"],
  "disagreements": ["point 1", "point 2"],
  "summary": "one sentence summary"
}

Rules:
- score must be an integer from 0 to 100
- agreements and disagreements must each have at least one item
- summary must be a single crisp sentence, under 24 words, focused on the final takeaway
- agreements should be short, scannable takeaway bullets rather than full explanations
- disagreements should capture only the main nuance or unresolved caveat, not minor repetition
- If everyone agrees on everything, score should be 90-100
- If there are minor differences in framing but same conclusion, score 70-89
- If there are substantive disagreements, score 40-69
- If they fundamentally disagree, score 0-39
- Return ONLY the JSON object, no markdown fences, no explanation${localeRule}`
}

function formatThread(messages: Message[]): string {
  return messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")
}

export async function POST(req: NextRequest) {
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

    // Need at least 2 AI messages to analyze consensus
    const aiMessages = discussionMessages.filter((m) => m.sender !== "user")
    if (aiMessages.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 AI messages to check consensus" },
        { status: 400 }
      )
    }

    // Format the whole conversation as a single text block
    const thread = formatThread(discussionMessages)

    // Call Gemini directly with one user message (avoids role alternation issues)
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

    const result = await model.generateContent({
      systemInstruction: {
        role: "system",
        parts: [{ text: getConsensusPrompt(locale) }],
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

    // Strip markdown fences if Gemini wraps the JSON
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim()

    const parsed: ConsensusResult = JSON.parse(cleaned)

    // Validate the shape
    if (
      typeof parsed.score !== "number" ||
      parsed.score < 0 ||
      parsed.score > 100 ||
      !Array.isArray(parsed.agreements) ||
      !Array.isArray(parsed.disagreements) ||
      typeof parsed.summary !== "string"
    ) {
      throw new Error("Invalid consensus response shape")
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error("Consensus error:", error)
    return NextResponse.json(
      { error: "Failed to analyze consensus" },
      { status: 500 }
    )
  }
}
