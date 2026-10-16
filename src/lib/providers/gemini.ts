/** Google Gemini streaming provider via Vertex AI and Google AI key fallback. */
import { VertexAI, HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai"
import type { Message } from "@/types"
import { getVertexConfig } from "@/lib/vertex-config"
import { redactSecrets } from "@/lib/redact-secrets"
import { loadGoogleApplicationCredentialsJson } from "@/lib/google-credentials"

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

function getModel() {
  const vertexAI = createVertexAI()
  return vertexAI.getGenerativeModel({
    model: GEMINI_MODEL,
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
}: {
  apiKey: string
  modelName: string
  contents: GoogleAiContent[]
  systemPrompt?: string
  generationConfig?: Record<string, unknown>
  signal?: AbortSignal
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
}: {
  apiKey: string
  modelName: string
  systemPrompt: string
  userPrompt: string
  generationConfig?: Record<string, unknown>
  signal?: AbortSignal
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
  })
}

export async function generateGeminiVerdictWithApiKey(args: {
  apiKey: string
  modelName: string
  systemPrompt: string
  userPrompt: string
  generationConfig?: Record<string, unknown>
  signal?: AbortSignal
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
  systemPrompt: string,
  messages: Message[],
  signal: AbortSignal | undefined,
  maxTokens: number,
  thinkHard: boolean
): AsyncGenerator<string> {
  const model = getModel()
  const contents = buildContents(messages)

  const result = await model.generateContentStream({
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens, ...geminiThinking(thinkHard) },
  })

  for await (const chunk of withTimeout(result.stream, STREAM_CHUNK_TIMEOUT_MS, signal)) {
    const text = geminiAnswerText(chunk.candidates?.[0]?.content?.parts)
    if (text) {
      yield text
    }
  }
}

// Streaming (used by chat route).
// Vertex occasionally returns a stream with no text candidates (safety filter,
// transient model issue). When that happens we retry the upstream call once
// before giving up, since these empties are usually a single-sample fluke.
export async function* streamGemini(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string,
  thinkHard = false
): AsyncGenerator<string> {
  const apiKey = userApiKey || getConfiguredGeminiApiKey()
  if (apiKey) {
    yield* streamGeminiWithApiKey(systemPrompt, messages, signal, maxTokens, apiKey, thinkHard)
    return
  }

  let yielded = false
  for await (const text of runGeminiStream(systemPrompt, messages, signal, maxTokens, thinkHard)) {
    yielded = true
    yield text
  }
  if (yielded || signal?.aborted) return

  // First attempt yielded nothing - retry once
  for await (const text of runGeminiStream(systemPrompt, messages, signal, maxTokens, thinkHard)) {
    yield text
  }
}

async function* streamGeminiWithApiKey(
  systemPrompt: string,
  messages: Message[],
  signal: AbortSignal | undefined,
  maxTokens: number,
  apiKey: string,
  thinkHard: boolean
): AsyncGenerator<string> {
  const response = await fetch(googleAiUrl(GEMINI_MODEL, "streamGenerateContent", apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      buildGoogleAiBody(systemPrompt, buildUserPrompt(messages), {
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
        const text = geminiAnswerText(parsed.candidates?.[0]?.content?.parts)
        if (text) {
          yield text
        }
      } catch {
        // Skip malformed SSE chunks.
      }
    }
  }
}
