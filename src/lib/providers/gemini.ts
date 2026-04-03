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
  return vertexAI.getGenerativeModel({
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
}

function buildContents(messages: Message[]) {
  return messages.map((msg) => ({
    role: msg.sender === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }))
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

const STREAM_CHUNK_TIMEOUT_MS = 15_000

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

// Streaming (used by chat route)
export async function* streamGemini(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024
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

