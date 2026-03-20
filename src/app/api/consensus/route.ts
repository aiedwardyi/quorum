import { NextRequest, NextResponse } from "next/server"
import type { Message, ConsensusResult } from "@/types"
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"

const projectId = process.env.VERTEX_PROJECT_ID!
const location = process.env.VERTEX_LOCATION!

const CONSENSUS_PROMPT = `You are a discussion analyst. Analyze the following group discussion between AI models and a human user.

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
- If everyone agrees on everything, score should be 90-100
- If there are minor differences in framing but same conclusion, score 70-89
- If there are substantive disagreements, score 40-69
- If they fundamentally disagree, score 0-39
- Return ONLY the JSON object, no markdown fences, no explanation`

function formatThread(messages: Message[]): string {
  return messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const messages: Message[] = body.messages

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      )
    }

    // Need at least 2 AI messages to analyze consensus
    const aiMessages = messages.filter((m) => m.sender !== "user")
    if (aiMessages.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 AI messages to check consensus" },
        { status: 400 }
      )
    }

    // Format the whole conversation as a single text block
    const thread = formatThread(messages)

    // Call Gemini directly with one user message (avoids role alternation issues)
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
        parts: [{ text: CONSENSUS_PROMPT }],
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
