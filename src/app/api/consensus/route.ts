import { NextRequest, NextResponse } from "next/server"
import type { Message, Locale, ResponseLength } from "@/types"
import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
  type ResponseSchema,
} from "@google-cloud/vertexai"
import { getVertexConfig } from "@/lib/vertex-config"
import { validateVerdictResult } from "@/lib/validate-verdict"
import { getVerdictPrompt } from "@/lib/verdict-prompt"
import { isPredominantlyKorean } from "@/lib/detect-language"
import { generateGeminiVerdictWithApiKey, getConfiguredGeminiApiKey } from "@/lib/providers/gemini"
import { redactSecrets } from "@/lib/redact-secrets"

/**
 * Vertex AI response schema mirroring validateVerdictResult. Forces the
 * model to emit a structurally valid JSON object with our exact field
 * names, instead of "helpful" prose or invented schemas (gemini-2.5-flash
 * was observed returning markdown bullet lists and renaming
 * recommendedAnswer to summary/recommendation when given only natural-
 * language instructions).
 *
 * Vertex's Schema subset doesn't support min/max constraints on numbers,
 * so the runtime range check on `confidence` stays in
 * validateVerdictResult as defense in depth. Optional fields are listed
 * in `properties` but omitted from `required` so the model can skip them.
 */
const VERDICT_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    recommendedAnswer: {
      type: SchemaType.STRING,
      description:
        "The single concrete recommendation the user should act on. Must be decisive and non-hedging.",
    },
    voteSplit: {
      type: SchemaType.STRING,
      description:
        "Human-readable tally of how the AI participants voted, e.g. '4/4 unanimous' or '3/4 in favor'.",
    },
    confidence: {
      type: SchemaType.NUMBER,
      description: "Confidence in the recommendation as a number between 0 and 100.",
    },
    reasons: {
      type: SchemaType.ARRAY,
      description:
        "Plain-string bullet points justifying the recommendation. Each element MUST be a simple string, not an object.",
      items: { type: SchemaType.STRING },
    },
    minorityView: {
      type: SchemaType.STRING,
      description:
        "The strongest dissenting position from the debate, even if no model held it explicitly.",
    },
    oppositeCase: {
      type: SchemaType.STRING,
      description:
        "The scenario in which the recommendation would be wrong - the user's situation that would flip the answer.",
    },
    analysis: {
      type: SchemaType.STRING,
      description: "Optional longer-form synthesis of the debate.",
    },
    keyTakeaways: {
      type: SchemaType.ARRAY,
      description: "Optional plain-string takeaways. Each element MUST be a simple string.",
      items: { type: SchemaType.STRING },
    },
    actionItems: {
      type: SchemaType.ARRAY,
      description: "Optional plain-string action items. Each element MUST be a simple string.",
      items: { type: SchemaType.STRING },
    },
  },
  required: [
    "recommendedAnswer",
    "voteSplit",
    "confidence",
    "reasons",
    "minorityView",
    "oppositeCase",
  ],
}

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
    const responseLength: ResponseLength =
      rawResponseLength === "short" ||
      rawResponseLength === "medium" ||
      rawResponseLength === "long"
        ? rawResponseLength
        : "medium"

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "messages array is required" }, { status: 400 })
    }

    const discussionMessages = messages.filter(
      (m) => m.sender !== "system" && m.sender !== "verdict"
    )

    // Match the chat route's behavior: if the USER'S OWN messages are
    // predominantly Korean, force the verdict prompt into Korean even
    // when the UI locale is English. We intentionally ignore AI responses
    // here so a single hallucinated Korean span in one AI's reply can't
    // cascade the whole verdict into Korean - same class of bug that
    // hit the chat route on 2026-04-11.
    const userOnlyMessages = discussionMessages.filter((m) => m.sender === "user")
    const effectiveLocale: Locale = isPredominantlyKorean(userOnlyMessages) ? "ko" : locale

    // Extract previous verdict recommendations for context
    const previousVerdicts = messages.filter((m) => m.sender === "verdict").map((m) => m.content)

    const aiMessages = discussionMessages.filter((m) => m.sender !== "user")
    if (aiMessages.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 AI messages to generate verdict" },
        { status: 400 }
      )
    }

    const thread = formatThread(discussionMessages)

    // Hybrid Flash/Pro verdict routing. The verdict's job is synthesis,
    // not deep reasoning - the 4 panelist AIs already did the heavy
    // thinking, and Flash is more than capable of picking the consensus
    // and formatting it. The one case where Pro is meaningfully better
    // is continuations: when there's already a prior verdict in the
    // thread, the new verdict must reconcile against it without flip-
    // flopping, and Pro is noticeably steadier at that. Everything else
    // - any length, any round count, any model count - uses Flash, which
    // cuts verdict wall time from ~15s to ~5s and now produces
    // schema-conforming JSON thanks to responseSchema enforcement.
    const useProModel = previousVerdicts.length > 0
    const verdictModelName = useProModel ? "gemini-2.5-pro" : "gemini-2.5-flash"
    const verdictTier = useProModel ? "pro" : "flash"
    const verdictPrompt = getVerdictPrompt(effectiveLocale, responseLength)
    const verdictUserPrompt = `Here is the discussion to analyze:\n\n${thread}${
      previousVerdicts.length > 0
        ? `\n\nPrevious verdict(s) from earlier rounds of this discussion:\n${previousVerdicts.map((v, i) => `- Round ${i + 1} verdict: ${JSON.stringify(v)}`).join("\n")}\n\nThe user continued the discussion after the above verdict(s). Analyze the NEW discussion carefully. Only change the recommendation if there is strong, specific new evidence. Do NOT flip-flop without justification.`
        : ""
    }`
    const verdictGenerationConfig = {
      responseMimeType: "application/json",
      responseSchema: VERDICT_RESPONSE_SCHEMA,
    }

    const { auth } = await import("@/lib/auth")
    const session = await auth()
    let userGeminiApiKey: string | undefined
    if (session?.user?.id) {
      try {
        const { getUserProviderApiKey } = await import("@/lib/user-api-keys")
        userGeminiApiKey = await getUserProviderApiKey(session.user.id, "gemini")
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error("[verdict] failed to load user Gemini API key:", msg)
      }
    }

    const geminiApiKey = userGeminiApiKey || getConfiguredGeminiApiKey()
    let model: ReturnType<VertexAI["getGenerativeModel"]> | null = null
    if (!geminiApiKey) {
      const { projectId, location } = getVertexConfig()
      const opts: ConstructorParameters<typeof VertexAI>[0] = { project: projectId, location }
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        opts.googleAuthOptions = {
          credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
        }
      }
      const vertexAI = new VertexAI(opts)
      model = vertexAI.getGenerativeModel({
        model: verdictModelName,
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
    }

    console.log(
      `[verdict] Generating verdict tier=${verdictTier} source=${userGeminiApiKey ? "user-key" : geminiApiKey ? "gemini-api-key" : "vertex"} for ${aiMessages.length} AI messages, locale=${locale}, effective=${effectiveLocale}, responseLength=${responseLength}, previousVerdicts=${previousVerdicts.length}`
    )

    // Per-tier timeout. Pro verdicts on a 2-round debate with 8 AI
    // messages legitimately run over a minute; give Pro a full 2
    // minutes of headroom so it never aborts mid-synthesis. Flash
    // verdicts finish well under 10s in local testing, so 30s is
    // plenty of margin - anything past that is a real problem we
    // want to surface quickly rather than hide behind a long wait.
    const VERDICT_TIMEOUT_MS = useProModel ? 120_000 : 30_000

    const generateVerdictText = async (
      userPrompt: string,
      timeoutMs: number
    ): Promise<{
      raw: string
      finishReason?: string
      safetyRatings?: unknown
      promptFeedback?: unknown
    }> => {
      if (geminiApiKey) {
        const raw = await Promise.race([
          generateGeminiVerdictWithApiKey({
            apiKey: geminiApiKey,
            modelName: verdictModelName,
            systemPrompt: verdictPrompt,
            userPrompt,
            generationConfig: verdictGenerationConfig as unknown as Record<string, unknown>,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Verdict generation timed out")), timeoutMs)
          ),
        ])
        return { raw, finishReason: "google-ai-key" }
      }

      if (!model) throw new Error("Gemini model is not configured")
      const result = await Promise.race([
        model.generateContent({
          systemInstruction: {
            role: "system",
            parts: [{ text: verdictPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          // Force structurally valid JSON matching VERDICT_RESPONSE_SCHEMA.
          // Without this, gemini-2.5-flash returns markdown prose or
          // invents alternate schemas (summary/recommendation instead of
          // recommendedAnswer). With it, both Flash and Pro emit
          // schema-conforming JSON the validator can accept directly.
          generationConfig: verdictGenerationConfig,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Verdict generation timed out")), timeoutMs)
        ),
      ])

      const candidate = result.response.candidates?.[0]
      return {
        raw: candidate?.content?.parts?.[0]?.text ?? "",
        finishReason: candidate?.finishReason,
        safetyRatings: candidate?.safetyRatings,
        promptFeedback: result.response.promptFeedback,
      }
    }

    const firstResult = await generateVerdictText(verdictUserPrompt, VERDICT_TIMEOUT_MS)

    const generateElapsed = Date.now() - startTime
    console.log(`[verdict] Gemini responded in ${generateElapsed}ms`)

    const raw = firstResult.raw

    if (!raw) {
      // Empty responses are usually a safety filter trip or a Pro
      // thinking-only response with no output tokens. Log the full
      // candidate shape so we can see finishReason/safetyRatings when
      // this recurs.
      console.error(`[verdict] Empty response. finishReason=${firstResult.finishReason}`, {
        safetyRatings: firstResult.safetyRatings,
        promptFeedback: firstResult.promptFeedback,
      })
      throw new Error("Gemini returned an empty response")
    }

    // Log ONLY metadata in production - the raw-response preview
    // echoes model output which frequently contains user document
    // content, legal text, or other sensitive inputs. In dev we keep
    // the preview for parse-debugging; in prod only length and the
    // Vertex finishReason ship to CloudWatch / equivalent.
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[verdict] Raw response length=${raw.length}, finishReason=${firstResult.finishReason ?? "unknown"}, first200=${raw.slice(0, 200).replace(/\n/g, "\\n")}`
      )
    } else {
      console.log(
        `[verdict] Raw response length=${raw.length}, finishReason=${firstResult.finishReason ?? "unknown"}`
      )
    }

    // Try to extract a JSON object from the response, even if Pro
    // wrapped it in thinking text or markdown prose. Strategy:
    //   1. Strip markdown code fences (```json ... ``` wrappers).
    //   2. If the result isn't pure JSON, find the first `{` and the
    //      last `}` and slice between them - this tolerates a preamble
    //      like "Here's my analysis:" or a trailing summary comment
    //      without needing a repair round-trip.
    const extractJson = (text: string): string => {
      const stripped = text
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim()
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
      // First-pass parse failed. Ask Gemini to repair it, then extract
      // again. The cleaned/retry previews contain model output which
      // can echo user documents and legal text - gate them to dev so
      // they never land in production server logs.
      const parseErrMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
      if (process.env.NODE_ENV === "development") {
        console.warn(
          `[verdict] JSON parse failed: ${parseErrMsg}. Cleaned preview=${cleaned.slice(0, 300).replace(/\n/g, "\\n")}`
        )
      } else {
        console.warn(`[verdict] JSON parse failed: ${parseErrMsg}`)
      }
      // Same schema enforcement on the repair retry. Without it the
      // retry path was the second observed source of wrong-schema
      // output (Flash inventing field names like 'summary').
      const retryResult = await generateVerdictText(
        `The following JSON is malformed. Fix it and return ONLY valid JSON, no other text:\n\n${cleaned}`,
        30_000
      )
      const retryRaw = retryResult.raw
      const retryCleaned = extractJson(retryRaw)
      try {
        parsed = JSON.parse(retryCleaned)
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr)
        if (process.env.NODE_ENV === "development") {
          console.error(
            `[verdict] Retry parse ALSO failed: ${retryMsg}. Retry preview=${retryCleaned.slice(0, 300).replace(/\n/g, "\\n")}`
          )
        } else {
          console.error(`[verdict] Retry parse ALSO failed: ${retryMsg}`)
        }
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
          parsed && typeof parsed === "object"
            ? Object.keys(parsed as object).join(",")
            : typeof parsed
        }`
      )
      throw validationErr
    }

    const elapsed = Date.now() - startTime
    console.log(`[verdict] Generated in ${elapsed}ms, confidence=${verdict.confidence}`)

    if (
      HEDGING_PHRASES.some((phrase) => verdict.recommendedAnswer.toLowerCase().includes(phrase))
    ) {
      console.warn(
        `[verdict] Hedging detected in recommendedAnswer: "${verdict.recommendedAnswer}"`
      )
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
