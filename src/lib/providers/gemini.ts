import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"
import type { Message } from "@/types"
import { getVertexConfig } from "@/lib/vertex-config"

function getModel() {
  const { projectId, location } = getVertexConfig()
  const opts: ConstructorParameters<typeof VertexAI>[0] = { project: projectId, location }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    opts.googleAuthOptions = {
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    }
  }
  const vertexAI = new VertexAI(opts)
  // gemini-2.5-pro instead of -flash: Gemini is a first-class debate
  // participant, and the response quality difference between Pro and
  // Flash is visible in reasoning-heavy prompts (legal analysis,
  // multi-source synthesis, structured comparisons). Users are paying
  // for a premium AI panel; a slightly slower Gemini is an acceptable
  // trade for noticeably better contributions. The smooth-stream
  // per-provider pacing already tolerates the larger token bursts.
  return vertexAI.getGenerativeModel({
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
  const thread = messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")
  return [
    {
      role: "user" as const,
      parts: [
        {
          text: `Here is the discussion so far:\n\n${thread}\n\nPlease respond to the discussion above.`,
        },
      ],
    },
  ]
}

// Non-streaming (used by consensus check later)
export async function queryGemini(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const model = getModel()
  const contents = buildContents(messages)

  const result = await model.generateContent({
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents,
  })

  const text =
    result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

  if (!text) {
    throw new Error("Gemini returned an empty response")
  }

  return text
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
  maxTokens: number
): AsyncGenerator<string> {
  const model = getModel()
  const contents = buildContents(messages)

  const result = await model.generateContentStream({
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  })

  for await (const chunk of withTimeout(result.stream, STREAM_CHUNK_TIMEOUT_MS, signal)) {
    const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
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
  maxTokens = 1024
): AsyncGenerator<string> {
  let yielded = false
  for await (const text of runGeminiStream(systemPrompt, messages, signal, maxTokens)) {
    yielded = true
    yield text
  }
  if (yielded || signal?.aborted) return

  // First attempt yielded nothing - retry once
  for await (const text of runGeminiStream(systemPrompt, messages, signal, maxTokens)) {
    yield text
  }
}

