import { NextRequest, NextResponse } from "next/server"
import type { Message, Locale, ResponseLength } from "@/types"
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"
import { getVertexConfig } from "@/lib/vertex-config"
import { validateVerdictResult } from "@/lib/validate-verdict"
import { getVerdictPrompt } from "@/lib/verdict-prompt"
import { isPredominantlyKorean } from "@/lib/detect-language"

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
    const rawResponseLength = body.responseLength
    const responseLength: ResponseLength = rawResponseLength === "short" || rawResponseLength === "medium" || rawResponseLength === "long" ? rawResponseLength : "medium"

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 }
      )
    }

    const discussionMessages = messages.filter((m) => m.sender !== "system" && m.sender !== "verdict")

    // Match the chat route's behavior: if the USER'S OWN messages are
    // predominantly Korean, force the verdict prompt into Korean even
    // when the UI locale is English. We intentionally ignore AI responses
    // here so a single hallucinated Korean span in one AI's reply can't
    // cascade the whole verdict into Korean - same class of bug that
    // hit the chat route on 2026-04-11.
    const userOnlyMessages = discussionMessages.filter((m) => m.sender === "user")
    const effectiveLocale: Locale = isPredominantlyKorean(userOnlyMessages) ? "ko" : locale

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
    // gemini-2.5-pro instead of -flash: the verdict synthesis is the
    // single decision the user walks away with, and the reasoning
    // quality difference between Pro and Flash on multi-model debate
    // analysis is worth the latency. Eddie: "for important documents
    // and decisions, precision matters more than speed."
    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.5-pro",
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

    console.log(`[verdict] Generating verdict for ${aiMessages.length} AI messages, locale=${locale}, effective=${effectiveLocale}`)

    // 120s - gemini-2.5-pro verdict synthesis on a 2-round debate with
    // 8 AI messages to analyze legitimately runs over a minute. The
    // first bump (30 -> 60) still tripped for Eddie mid-test, so give
    // it a full 2 minutes of headroom. Users see the analyzing spinner
    // and verdict skeleton card during this time, so the longer wait
    // is visible-but-acceptable UX.
    const VERDICT_TIMEOUT_MS = 120_000
    const result = await Promise.race([
      model.generateContent({
        systemInstruction: {
          role: "system",
          parts: [{ text: getVerdictPrompt(effectiveLocale, responseLength) }],
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

    const generateElapsed = Date.now() - startTime
    console.log(`[verdict] Vertex responded in ${generateElapsed}ms`)

    const raw =
      result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    if (!raw) {
      // Empty responses are usually a safety filter trip or a Pro
      // thinking-only response with no output tokens. Log the full
      // candidate shape so we can see finishReason/safetyRatings when
      // this recurs.
      const candidate = result.response.candidates?.[0]
      console.error(`[verdict] Empty response. finishReason=${candidate?.finishReason}`, {
        safetyRatings: candidate?.safetyRatings,
        promptFeedback: result.response.promptFeedback,
      })
      throw new Error("Gemini returned an empty response")
    }

    console.log(`[verdict] Raw response length=${raw.length}, first200=${raw.slice(0, 200).replace(/\n/g, "\\n")}`)

    // Try to extract a JSON object from the response, even if Pro
    // wrapped it in thinking text or markdown prose. Strategy:
    //   1. Strip markdown code fences (```json ... ``` wrappers).
    //   2. If the result isn't pure JSON, find the first `{` and the
    //      last `}` and slice between them - this tolerates a preamble
    //      like "Here's my analysis:" or a trailing summary comment
    //      without needing a repair round-trip.
    const extractJson = (text: string): string => {
      const stripped = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim()
      if (stripped.startsWith("{") && stripped.endsWith("}")) return stripped
      const first = stripped.indexOf("{")
      const last = stripped.lastIndexOf("}")
      if (first < 0 || last < 0 || last <= first) return stripped
      return stripped.slice(first, last + 1)
    }

    const cleaned = extractJson(raw)

    let parsed: unknown
    try {
      parsed = JSON.parse(cleaned)
    } catch (jsonErr) {
      // First-pass parse failed. Ask Vertex to repair it, then extract
      // again. Log both so we can see what Pro is returning in the
      // wild when this recurs.
      const parseErrMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
      console.warn(
        `[verdict] JSON parse failed: ${parseErrMsg}. Cleaned preview=${cleaned.slice(0, 300).replace(/\n/g, "\\n")}`
      )
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
          setTimeout(() => reject(new Error("JSON retry timed out")), 30_000)
        ),
      ])
      const retryRaw = retryResult.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
      const retryCleaned = extractJson(retryRaw)
      try {
        parsed = JSON.parse(retryCleaned)
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        console.error(
          `[verdict] Retry parse ALSO failed: ${retryMsg}. Retry preview=${retryCleaned.slice(0, 300).replace(/\n/g, "\\n")}`
        )
        throw retryErr
      }
    }

    let verdict
    try {
      verdict = validateVerdictResult(parsed)
    } catch (validationErr) {
      const valMsg = validationErr instanceof Error ? validationErr.message : String(validationErr)
      console.error(
        `[verdict] Validation failed: ${valMsg}. Parsed keys=${
          parsed && typeof parsed === "object" ? Object.keys(parsed as object).join(",") : typeof parsed
        }`
      )
      throw validationErr
    }

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
