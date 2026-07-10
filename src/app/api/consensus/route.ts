/** Consensus verdict route - tries Gemini, Claude, GPT, then Perplexity. */
import { NextRequest, NextResponse } from "next/server"
import type { Message, Locale, ResponseLength, Provider } from "@/types"
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
import { generateClaudeVerdict } from "@/lib/providers/claude"
import { generateGptVerdict } from "@/lib/providers/gpt"
import { generatePerplexityVerdict } from "@/lib/providers/perplexity"
import { redactSecrets } from "@/lib/redact-secrets"
import {
  buildConsensusProviderOrder,
  humanVerdictError,
  NO_CONSENSUS_KEY_MESSAGE,
  resolveConsensusCandidates,
  type ConsensusCandidate,
} from "@/lib/consensus-resolve"

/** Forces structurally valid JSON with our exact field names - flash was seen
 *  emitting markdown lists and renaming fields under prose instructions alone.
 *  Vertex's Schema subset lacks numeric min/max, so the confidence range check
 *  stays in validateVerdictResult. */
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

function extractJson(text: string): string {
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

function parseBodyKeys(body: Record<string, unknown>): Partial<Record<Provider, string>> {
  const out: Partial<Record<Provider, string>> = {}
  const raw = body.userApiKeys
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const p of ["gemini", "claude", "gpt", "perplexity"] as Provider[]) {
      const v = (raw as Record<string, unknown>)[p]
      if (typeof v === "string" && v.trim()) out[p] = v.trim()
    }
  }
  // Back-compat: single gemini body key from older clients.
  if (typeof body.userApiKey === "string" && body.userApiKey.trim()) {
    out.gemini = body.userApiKey.trim()
  }
  return out
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs)
    ),
  ])
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

    // User messages only - AI hallucinating Korean must not cascade the whole verdict into Korean.
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

    // Flash for first verdicts (~5s); Pro for continuations where it must reconcile without flip-flopping.
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

    const requestAccessCode = typeof body.accessCode === "string" ? body.accessCode : undefined
    const bodyKeys = parseBodyKeys(body as Record<string, unknown>)
    const order = buildConsensusProviderOrder(body.preferredProviders)
    const { candidates, lookupFailed } = await resolveConsensusCandidates(
      order,
      bodyKeys,
      requestAccessCode,
      "verdict"
    )

    if (lookupFailed && candidates.length === 0) {
      return NextResponse.json({ error: "key_lookup_failed" }, { status: 500 })
    }
    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: "no_key",
          provider: order[0] ?? "gemini",
          message: NO_CONSENSUS_KEY_MESSAGE,
        },
        { status: 402 }
      )
    }

    // Pro can legitimately take 2+ minutes; long Flash needs headroom past medium.
    // Amplify may still cut at ~30s - client maps 504 to a plain-language timeout.
    const VERDICT_TIMEOUT_MS = useProModel
      ? 120_000
      : responseLength === "long"
        ? 55_000
        : responseLength === "short"
          ? 30_000
          : 45_000

    const generateRaw = async (
      candidate: ConsensusCandidate,
      userPrompt: string,
      timeoutMs: number
    ): Promise<string> => {
      const run = async (): Promise<string> => {
        if (candidate.provider === "claude") {
          return generateClaudeVerdict({
            apiKey: candidate.apiKey,
            systemPrompt: verdictPrompt,
            userPrompt,
          })
        }
        if (candidate.provider === "gpt") {
          return generateGptVerdict({
            apiKey: candidate.apiKey,
            systemPrompt: verdictPrompt,
            userPrompt,
          })
        }
        if (candidate.provider === "perplexity") {
          return generatePerplexityVerdict({
            apiKey: candidate.apiKey,
            systemPrompt: verdictPrompt,
            userPrompt,
          })
        }

        // Gemini: user/server AI Studio key, else Vertex ADC.
        const geminiApiKey = candidate.apiKey || getConfiguredGeminiApiKey()
        if (geminiApiKey) {
          return generateGeminiVerdictWithApiKey({
            apiKey: geminiApiKey,
            modelName: verdictModelName,
            systemPrompt: verdictPrompt,
            userPrompt,
            generationConfig: verdictGenerationConfig as unknown as Record<string, unknown>,
          })
        }

        const { projectId, location } = getVertexConfig()
        const opts: ConstructorParameters<typeof VertexAI>[0] = { project: projectId, location }
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
          opts.googleAuthOptions = {
            credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
          }
        }
        const vertexAI = new VertexAI(opts)
        const model = vertexAI.getGenerativeModel({
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
        const result = await model.generateContent({
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
          generationConfig: verdictGenerationConfig,
        })
        return result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
      }

      return withTimeout(run(), timeoutMs, "Verdict generation")
    }

    let lastError: unknown
    for (const candidate of candidates) {
      const source = candidate.apiKey ? "user-key" : "server"
      console.log(
        `[verdict] Trying provider=${candidate.provider} tier=${verdictTier} source=${source} for ${aiMessages.length} AI messages, locale=${locale}, effective=${effectiveLocale}, responseLength=${responseLength}, previousVerdicts=${previousVerdicts.length}`
      )

      try {
        const raw = await generateRaw(candidate, verdictUserPrompt, VERDICT_TIMEOUT_MS)

        const generateElapsed = Date.now() - startTime
        console.log(
          `[verdict] ${candidate.provider} responded in ${generateElapsed}ms, length=${raw.length}`
        )

        if (!raw) throw new Error("empty response")

        if (process.env.NODE_ENV === "development") {
          console.log(
            `[verdict] Raw response length=${raw.length}, first200=${raw.slice(0, 200).replace(/\n/g, "\\n")}`
          )
        }

        const cleaned = extractJson(raw)
        let parsed: unknown
        try {
          parsed = JSON.parse(cleaned)
        } catch (jsonErr) {
          const parseErrMsg = jsonErr instanceof Error ? jsonErr.message : String(jsonErr)
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[verdict] JSON parse failed: ${parseErrMsg}. Cleaned preview=${cleaned.slice(0, 300).replace(/\n/g, "\\n")}`
            )
          } else {
            console.warn(`[verdict] JSON parse failed: ${parseErrMsg}`)
          }
          const retryRaw = await generateRaw(
            candidate,
            `The following JSON is malformed. Fix it and return ONLY valid JSON, no other text:\n\n${cleaned}`,
            30_000
          )
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

        const verdict = validateVerdictResult(parsed)

        const elapsed = Date.now() - startTime
        console.log(
          `[verdict] Generated via ${candidate.provider} in ${elapsed}ms, confidence=${verdict.confidence}`
        )

        if (
          HEDGING_PHRASES.some((phrase) => verdict.recommendedAnswer.toLowerCase().includes(phrase))
        ) {
          console.warn(
            `[verdict] Hedging detected in recommendedAnswer: "${verdict.recommendedAnswer}"`
          )
        }

        return NextResponse.json(verdict)
      } catch (err) {
        lastError = err
        const msg = redactSecrets(err instanceof Error ? err.message : String(err))
        console.error(`[verdict] provider=${candidate.provider} failed:`, msg)
      }
    }

    const elapsed = Date.now() - startTime
    const message = humanVerdictError(lastError)
    console.error(`[verdict] All providers failed after ${elapsed}ms:`, message)
    return NextResponse.json(
      {
        error: "Failed to generate verdict",
        message,
        ...(process.env.NODE_ENV === "development"
          ? { detail: redactSecrets(lastError instanceof Error ? lastError.message : "Unknown") }
          : {}),
      },
      { status: 500 }
    )
  } catch (error) {
    const elapsed = Date.now() - startTime
    const message = humanVerdictError(error)
    const detail = redactSecrets(error instanceof Error ? error.message : "Unknown error")
    console.error(`[verdict] Failed after ${elapsed}ms:`, detail)
    return NextResponse.json(
      {
        error: "Failed to generate verdict",
        message,
        ...(process.env.NODE_ENV === "development" ? { detail } : {}),
      },
      { status: 500 }
    )
  }
}
