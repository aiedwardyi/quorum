/** Google Gemini streaming provider via Vertex AI and Google AI key fallback. */
import { VertexAI, HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai"
import type { Message } from "@/types"
import { getVertexConfig } from "@/lib/vertex-config"
import { redactSecrets } from "@/lib/redact-secrets"
import { loadGoogleApplicationCredentialsJson } from "@/lib/google-credentials"
import {
  streamUsage,
  usageCents,
  type ExactUsage,
  type ModelUsage,
  type UsageSink,
} from "@/lib/host-cost"

const GOOGLE_AI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

type GoogleAiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

type GoogleAiContent = {
  role: "user" | "model"
  parts: GoogleAiPart[]
}

export function getConfiguredGeminiApiKey(): string | undefined {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey || apiKey.startsWith("your_")) return undefined
  return apiKey
}

export const GEMINI_MODEL = "gemini-3.8-flash"
// 3.x thinks by default (10s+ TTFT); budget 0 keeps first-token latency ~2s.
export const GEMINI_NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } }
// Lowest non-zero level; MINIMAL is rejected on 3.8.
export const GEMINI_LIGHT_THINKING = { thinkingConfig: { thinkingLevel: "LOW" } }

export function geminiThinking(thinkHard: boolean) {
  return thinkHard ? GEMINI_LIGHT_THINKING : GEMINI_NO_THINKING
}

// 3.8 shares Google's global capacity pool and can 429 or stall for a minute; 2.5 Flash then answers.
export const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash"
// 3.8's first text normally lands in ~2s; CloudFront cuts a silent response at 30s.
export const GEMINI_FIRST_TEXT_MS = 8_000
export const GEMINI_THINK_HARD_FIRST_TEXT_MS = 15_000

// After a 3.8 failure this instance skips 3.8 for a while instead of waiting out each stall.
const GEMINI_PRIMARY_COOLDOWN_MS = 120_000
let primaryCoolUntil = 0

export function geminiPrimaryCooling(): boolean {
  return Date.now() < primaryCoolUntil
}

export function noteGeminiPrimaryFailure(): void {
  primaryCoolUntil = Date.now() + GEMINI_PRIMARY_COOLDOWN_MS
}

// 2.5 rejects thinkingLevel, so think hard gets a token budget instead.
export function vertexThinking(modelName: string, thinkHard: boolean) {
  if (modelName === GEMINI_MODEL) return geminiThinking(thinkHard)
  return { thinkingConfig: { thinkingBudget: thinkHard ? 1024 : 0 } }
}

type GeminiUsageMetadata = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  cachedContentTokenCount?: number
}

// Vertex stream chunks carry no counts until the last one, so only reported fields are kept.
function geminiExact(meta: GeminiUsageMetadata | undefined): ExactUsage {
  const out: ExactUsage = {}
  if (meta?.promptTokenCount !== undefined) {
    const cached = meta.cachedContentTokenCount ?? 0
    out.inputTokens = Math.max(0, meta.promptTokenCount - cached)
    out.cacheReadTokens = cached
  }
  if (meta?.candidatesTokenCount !== undefined) {
    out.outputTokens = meta.candidatesTokenCount + (meta.thoughtsTokenCount ?? 0)
  }
  return out
}

export function geminiUsage(
  meta: GeminiUsageMetadata | undefined,
  model = GEMINI_MODEL
): ModelUsage | undefined {
  const exact = geminiExact(meta)
  if (exact.inputTokens === undefined && exact.outputTokens === undefined) return undefined
  return {
    model,
    inputTokens: exact.inputTokens ?? 0,
    outputTokens: exact.outputTokens ?? 0,
    cacheReadTokens: exact.cacheReadTokens ?? 0,
  }
}

// Priced per model, since the fallback runs on a different model than the first attempt.
export function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return { ...b, costUsd: (usageCents(a) + usageCents(b)) / 100 }
}

/** Answer text only; thought parts never reach the user. */
export function geminiAnswerText(
  parts: { text?: string; thought?: boolean }[] | undefined
): string {
  return (parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("")
}

// 3.8 is only served from the global endpoint.
export function createVertexAI() {
  const { projectId } = getVertexConfig()
  const opts: ConstructorParameters<typeof VertexAI>[0] = {
    project: projectId,
    location: "global",
    apiEndpoint: "aiplatform.googleapis.com",
  }
  const credentials = loadGoogleApplicationCredentialsJson()
  if (credentials) {
    opts.googleAuthOptions = { credentials }
  }
  return new VertexAI(opts)
}

export function getVertexModel(modelName: string) {
  const vertexAI = createVertexAI()
  return vertexAI.getGenerativeModel({
    model: modelName,
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

// Pack the entire debate into one user message with [DisplayName]:
// speaker labels, matching how Claude, GPT, and Perplexity format
// the thread.
//
// The earlier implementation sent each message as its own turn with
// role "user" for user messages and role "model" for AI responses.
// That confuses Vertex's multi-turn semantics in a group-chat context:
// Vertex's `model` role means "this was ME (Gemini) speaking in a
// previous turn", so when we include Perplexity / Claude / GPT
// responses as `role: "model"`, Gemini thinks IT said all of them.
// The symptom surfaced the moment we moved Gemini to the end of the
// default rotation - its first round-2 turn now sees three prior
// `model` entries and Gemini's identity collapses. The bubble came
// back as "Gemini, what do you think?" (Gemini addressing itself)
// and then cascaded into Perplexity/Claude doing the same in the
// next round because they saw Gemini's confused output and mirrored
// it.
//
// Packing everything into a single labeled user message makes the
// speaker-attribution explicit in-text, and Gemini just responds as
// itself per the system prompt. No more identity bleed.
function buildContents(messages: Message[]) {
  return [
    {
      role: "user" as const,
      parts: [
        {
          text: buildUserPrompt(messages),
        },
      ],
    },
  ]
}

function buildThread(messages: Message[]): string {
  return messages.map((m) => `[${m.displayName}]: ${m.content}`).join("\n\n")
}

function buildUserPrompt(messages: Message[]): string {
  return `Here is the discussion so far:\n\n${buildThread(messages)}\n\nPlease respond to the discussion above.`
}

function googleAiUrl(
  modelName: string,
  action: "generateContent" | "streamGenerateContent",
  apiKey: string
): string {
  const params = new URLSearchParams({ key: apiKey })
  if (action === "streamGenerateContent") params.set("alt", "sse")
  return `${GOOGLE_AI_API_BASE}/${modelName}:${action}?${params.toString()}`
}

function buildGoogleAiBody(
  systemPrompt: string,
  userPrompt: string,
  generationConfig?: Record<string, unknown>
) {
  return {
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    ...(generationConfig ? { generationConfig } : {}),
  }
}

export async function generateGoogleAiContentWithApiKey({
  apiKey,
  modelName,
  contents,
  systemPrompt,
  generationConfig,
  signal,
  onUsage,
}: {
  apiKey: string
  modelName: string
  contents: GoogleAiContent[]
  systemPrompt?: string
  generationConfig?: Record<string, unknown>
  signal?: AbortSignal
  onUsage?: UsageSink
}): Promise<string> {
  const response = await fetch(googleAiUrl(modelName, "generateContent", apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemPrompt
        ? { systemInstruction: { role: "system", parts: [{ text: systemPrompt }] } }
        : {}),
      contents,
      ...(generationConfig ? { generationConfig } : {}),
    }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Gemini API error (${response.status}): ${await readGoogleAiError(response)}`)
  }

  const data = await response.json()
  const usage = geminiUsage(data.usageMetadata)
  if (usage) onUsage?.(usage)
  return geminiAnswerText(data.candidates?.[0]?.content?.parts)
}

async function readGoogleAiError(response: Response): Promise<string> {
  const raw = await response.text()
  try {
    const parsed = JSON.parse(raw)
    return redactSecrets(parsed?.error?.message || raw)
  } catch {
    return redactSecrets(raw)
  }
}

async function generateWithGoogleAiKey({
  apiKey,
  modelName,
  systemPrompt,
  userPrompt,
  generationConfig,
  signal,
  onUsage,
}: {
  apiKey: string
  modelName: string
  systemPrompt: string
  userPrompt: string
  generationConfig?: Record<string, unknown>
  signal?: AbortSignal
  onUsage?: UsageSink
}): Promise<string> {
  return generateGoogleAiContentWithApiKey({
    apiKey,
    modelName,
    systemPrompt,
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig,
    signal,
    onUsage,
  })
}

export async function generateGeminiVerdictWithApiKey(args: {
  apiKey: string
  modelName: string
  systemPrompt: string
  userPrompt: string
  generationConfig?: Record<string, unknown>
  signal?: AbortSignal
  onUsage?: UsageSink
}): Promise<string> {
  return generateWithGoogleAiKey(args)
}

const STREAM_CHUNK_TIMEOUT_MS = 45_000

async function* withTimeout<T>(
  iterable: AsyncIterable<T>,
  timeoutMs: number,
  signal?: AbortSignal
): AsyncGenerator<T> {
  const iterator = iterable[Symbol.asyncIterator]()
  while (true) {
    if (signal?.aborted) {
      await iterator.return?.()
      return
    }
    let timerId: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race<IteratorResult<T> | "timeout">([
        iterator.next(),
        new Promise<"timeout">((resolve) => {
          timerId = setTimeout(() => resolve("timeout"), timeoutMs)
        }),
      ])
      if (result === "timeout") {
        await iterator.return?.()
        throw new Error(`Stream timed out after ${timeoutMs}ms`)
      }
      if (result.done) return
      yield result.value
    } finally {
      clearTimeout(timerId)
    }
  }
}

async function* runGeminiStream(
  modelName: string,
  systemPrompt: string,
  messages: Message[],
  signal: AbortSignal | undefined,
  maxTokens: number,
  thinkHard: boolean,
  onUsage?: UsageSink
): AsyncGenerator<string> {
  const model = getVertexModel(modelName)
  const contents = buildContents(messages)
  const usage = streamUsage(modelName, systemPrompt + buildUserPrompt(messages), onUsage)

  const result = await model.generateContentStream({
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens, ...vertexThinking(modelName, thinkHard) },
  })
  usage.started()

  for await (const chunk of withTimeout(result.stream, STREAM_CHUNK_TIMEOUT_MS, signal)) {
    usage.exact(geminiExact(chunk.usageMetadata))
    const text = geminiAnswerText(chunk.candidates?.[0]?.content?.parts)
    if (text) {
      usage.text(text)
      yield text
    }
  }
}

/** First text from the stream, or null if it errors, ends empty, or misses the deadline. */
async function firstTextWithin(
  iterator: AsyncIterator<string>,
  timeoutMs: number
): Promise<string | null> {
  const next = iterator.next()
  next.catch(() => {})
  let timerId: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race<IteratorResult<string> | "timeout">([
      next,
      new Promise<"timeout">((resolve) => {
        timerId = setTimeout(() => resolve("timeout"), timeoutMs)
      }),
    ])
    if (result === "timeout") {
      console.warn(
        `[gemini] ${GEMINI_MODEL} no text in ${timeoutMs}ms; using ${GEMINI_FALLBACK_MODEL}`
      )
      return null
    }
    if (result.done) {
      console.warn(`[gemini] ${GEMINI_MODEL} empty reply; using ${GEMINI_FALLBACK_MODEL}`)
      return null
    }
    return result.value
  } catch (err) {
    const msg = redactSecrets(err instanceof Error ? err.message : String(err))
    console.warn(`[gemini] ${GEMINI_MODEL} failed; using ${GEMINI_FALLBACK_MODEL}:`, msg)
    return null
  } finally {
    clearTimeout(timerId)
  }
}

// Streaming (used by chat route). A Vertex 3.8 call that errors, stalls, or
// comes back empty is redone once on the fallback model.
export async function* streamGemini(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string,
  thinkHard = false,
  onUsage?: UsageSink
): AsyncGenerator<string> {
  const apiKey = userApiKey || getConfiguredGeminiApiKey()
  if (apiKey) {
    yield* streamGeminiWithApiKey(
      systemPrompt,
      messages,
      signal,
      maxTokens,
      apiKey,
      thinkHard,
      onUsage
    )
    return
  }

  if (geminiPrimaryCooling()) {
    yield* runGeminiStream(
      GEMINI_FALLBACK_MODEL,
      systemPrompt,
      messages,
      signal,
      maxTokens,
      thinkHard,
      onUsage
    )
    return
  }

  let firstUsage: ModelUsage | undefined
  let primaryLive = true
  // An abandoned stall can still report later; it must not overwrite the fallback's usage.
  const firstSink: UsageSink = (u) => {
    if (!primaryLive) return
    firstUsage = u
    onUsage?.(u)
  }
  const primary = runGeminiStream(
    GEMINI_MODEL,
    systemPrompt,
    messages,
    signal,
    maxTokens,
    thinkHard,
    firstSink
  )[Symbol.asyncIterator]()
  const first = await firstTextWithin(
    primary,
    thinkHard ? GEMINI_THINK_HARD_FIRST_TEXT_MS : GEMINI_FIRST_TEXT_MS
  )
  if (first !== null) {
    yield first
    while (true) {
      const { done, value } = await primary.next()
      if (done) return
      yield value
    }
  }
  primaryLive = false
  if (signal?.aborted) return
  noteGeminiPrimaryFailure()

  const retrySink: UsageSink = (u) => onUsage?.(firstUsage ? addUsage(firstUsage, u) : u)
  yield* runGeminiStream(
    GEMINI_FALLBACK_MODEL,
    systemPrompt,
    messages,
    signal,
    maxTokens,
    thinkHard,
    retrySink
  )
}

async function* streamGeminiWithApiKey(
  systemPrompt: string,
  messages: Message[],
  signal: AbortSignal | undefined,
  maxTokens: number,
  apiKey: string,
  thinkHard: boolean,
  onUsage?: UsageSink
): AsyncGenerator<string> {
  const userPrompt = buildUserPrompt(messages)
  const usage = streamUsage(GEMINI_MODEL, systemPrompt + userPrompt, onUsage)
  const response = await fetch(googleAiUrl(GEMINI_MODEL, "streamGenerateContent", apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildGoogleAiBody(systemPrompt, userPrompt, {
        maxOutputTokens: maxTokens,
        ...geminiThinking(thinkHard),
      })
    ),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Gemini API error (${response.status}): ${await readGoogleAiError(response)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body from Gemini")
  usage.started()

  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue

      try {
        const parsed = JSON.parse(trimmed.slice(5).trim())
        usage.exact(geminiExact(parsed.usageMetadata))
        const text = geminiAnswerText(parsed.candidates?.[0]?.content?.parts)
        if (text) {
          usage.text(text)
          yield text
        }
      } catch {
        // Skip malformed SSE chunks.
      }
    }
  }
}
