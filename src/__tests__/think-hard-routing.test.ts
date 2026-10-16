import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"

const anthropicCreateMock = vi.hoisted(() => vi.fn())
const openaiCreateMock = vi.hoisted(() => vi.fn())

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreateMock }
  },
}))
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: openaiCreateMock } }
  },
}))

import { streamClaude, claudeModelParams } from "@/lib/providers/claude"
import { streamGPT, gptModelParams } from "@/lib/providers/gpt"
import { streamPerplexity } from "@/lib/providers/perplexity"
import {
  GEMINI_NO_THINKING,
  geminiAnswerText,
  geminiThinking,
  streamGemini,
} from "@/lib/providers/gemini"
import { fetchConsensusWithFallback, readChatStream } from "@/hooks/useDebateEngine"
import { withFastFallback } from "@/lib/think-hard"

const messages: Message[] = [
  {
    id: "u1",
    sender: "user",
    displayName: "You",
    content: "E11.9 vs E11.65?",
    timestamp: new Date(0),
  },
]

async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let out = ""
  for await (const chunk of gen) out += chunk
  return out
}

async function* empty() {}

function sse(lines: string[]): Response {
  return new Response(lines.map((l) => `data: ${l}\n\n`).join(""), { status: 200 })
}

describe("think hard model routing", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    anthropicCreateMock.mockReset().mockResolvedValue(empty())
    openaiCreateMock.mockReset().mockResolvedValue(empty())
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("off: Claude request is exactly today's Haiku request", async () => {
    await drain(streamClaude("sys", messages, undefined, 2048, "k"))
    const params = anthropicCreateMock.mock.calls[0][0]
    expect(params.model).toBe("claude-haiku-5-5")
    expect(params.thinking).toEqual({ type: "disabled" })
    expect(params.output_config).toEqual({ effort: "low" })
    expect(params.max_tokens).toBe(2048)
  })

  it("on: Claude runs Opus 5.5 with light adaptive thinking", async () => {
    await drain(streamClaude("sys", messages, undefined, 10240, "k", true))
    const params = anthropicCreateMock.mock.calls[0][0]
    expect(params.model).toBe("claude-opus-5-5")
    expect(params.thinking).toEqual({ type: "adaptive" })
    expect(params.output_config).toEqual({ effort: "low" })
    expect(claudeModelParams(true).model).toBe("claude-opus-5-5")
  })

  it("on: Claude yields answer text only, never thinking deltas", async () => {
    anthropicCreateMock.mockResolvedValue(
      (async function* () {
        yield { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm" } }
        yield { type: "content_block_delta", delta: { type: "text_delta", text: "Answer." } }
      })()
    )
    expect(await drain(streamClaude("sys", messages, undefined, 10240, "k", true))).toBe("Answer.")
  })

  it("off: GPT request is exactly today's gpt-4o request", async () => {
    await drain(streamGPT("sys", messages, undefined, 2048, "k"))
    const params = openaiCreateMock.mock.calls[0][0]
    expect(params.model).toBe("gpt-4o")
    expect(params.max_tokens).toBe(2048)
    expect(params).not.toHaveProperty("reasoning_effort")
    expect(params).not.toHaveProperty("max_completion_tokens")
  })

  it("on: GPT runs gpt-6.1-sol at its lowest reasoning effort", async () => {
    await drain(streamGPT("sys", messages, undefined, 10240, "k", true))
    const params = openaiCreateMock.mock.calls[0][0]
    expect(params.model).toBe("gpt-6.1-sol")
    expect(params.reasoning_effort).toBe("low")
    expect(params.max_completion_tokens).toBe(10240)
    expect(params).not.toHaveProperty("max_tokens")
    expect(gptModelParams(false, 1).model).toBe("gpt-4o")
  })

  it("off: Perplexity stays on sonar-pro", async () => {
    fetchMock.mockResolvedValue(sse([`{"choices":[{"delta":{"content":"Hi."}}]}`, "[DONE]"]))
    expect(await drain(streamPerplexity("sys", messages, undefined, 2048, "k"))).toBe("Hi.")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("sonar-pro")
  })

  it("on: Perplexity runs sonar-reasoning-pro and strips <think> from the answer", async () => {
    fetchMock.mockResolvedValue(
      sse([
        `{"choices":[{"delta":{"content":"<think>check ICD"}}]}`,
        `{"choices":[{"delta":{"content":"-10</think>E11.65 "}}]}`,
        `{"choices":[{"delta":{"content":"is hyperglycemia."}}]}`,
        "[DONE]",
      ])
    )
    const out = await drain(streamPerplexity("sys", messages, undefined, 10240, "k", true))
    expect(out).toBe("E11.65 is hyperglycemia.")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("sonar-reasoning-pro")
  })

  it("off/on: Gemini keeps the model and only switches thinking budget 0 to LOW", async () => {
    fetchMock.mockImplementation(async () =>
      sse([`{"candidates":[{"content":{"parts":[{"text":"Ok."}]}}]}`])
    )
    await drain(streamGemini("sys", messages, undefined, 2048, "user-key"))
    await drain(streamGemini("sys", messages, undefined, 10240, "user-key", true))
    const [off, on] = fetchMock.mock.calls.map((c) => ({
      url: String(c[0]),
      body: JSON.parse(c[1].body),
    }))
    expect(off.url).toContain("gemini-3.8-flash")
    expect(on.url).toContain("gemini-3.8-flash")
    expect(off.body.generationConfig).toEqual({
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    })
    expect(on.body.generationConfig).toEqual({
      maxOutputTokens: 10240,
      thinkingConfig: { thinkingLevel: "LOW" },
    })
    expect(geminiThinking(false)).toBe(GEMINI_NO_THINKING)
  })

  it("Gemini drops thought parts from the answer", () => {
    expect(geminiAnswerText([{ text: "reasoning", thought: true }, { text: "Answer." }])).toBe(
      "Answer."
    )
    expect(geminiAnswerText(undefined)).toBe("")
  })
})

describe("panelist cut stream", () => {
  function chatStream(events: unknown[]): ReadableStream<Uint8Array> {
    return new Response(
      events
        .map(
          (e) => `data: ${JSON.stringify(e)}

`
        )
        .join("")
    ).body!
  }

  // Mirrors callModel: a think-hard stream with no done event counts as failed.
  async function seat(streams: Record<"think" | "fast", unknown[]>) {
    const shown: string[] = []
    const out = await withFastFallback(
      true,
      async (th) => {
        const r = await readChatStream(
          chatStream(th ? streams.think : streams.fast),
          (c) => shown.push(c),
          () => false
        )
        return th && r.finalContent === null ? null : r.finalContent
      },
      (r) => r === null
    )
    return { ...out, shown }
  }

  it("a think-hard stream cut mid-answer falls back to the fast answer", async () => {
    const { result, fellBack } = await seat({
      think: [{ chunk: "Partial answer that got " }],
      fast: [{ chunk: "Quick answer." }, { done: true, content: "Quick answer." }],
    })
    expect(fellBack).toBe(true)
    expect(result).toBe("Quick answer.")
  })

  it("a complete think-hard stream is kept", async () => {
    const { result, fellBack } = await seat({
      think: [{ chunk: "Careful answer." }, { done: true, content: "Careful answer." }],
      fast: [{ done: true, content: "unused" }],
    })
    expect(fellBack).toBe(false)
    expect(result).toBe("Careful answer.")
  })

  it("an error event from the server falls back to the fast answer", async () => {
    const { result, fellBack } = await seat({
      think: [{ chunk: "Partial" }, { error: "think_hard_timeout" }],
      fast: [{ done: true, content: "Quick answer." }],
    })
    expect(fellBack).toBe(true)
    expect(result).toBe("Quick answer.")
  })
})

describe("fetchConsensusWithFallback", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const bodyOf = (i: number) => JSON.parse(fetchMock.mock.calls[i][1].body)

  it("off: sends exactly one request with no thinkHard field", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    const { fellBack } = await fetchConsensusWithFallback(
      messages,
      "en",
      "medium",
      false,
      undefined,
      false
    )
    expect(fellBack).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(bodyOf(0)).not.toHaveProperty("thinkHard")
  })

  it("on: a think-hard 504 retries once in fast mode", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("", { status: 504 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const { result, fellBack } = await fetchConsensusWithFallback(
      messages,
      "en",
      "medium",
      false,
      undefined,
      true
    )
    expect(fellBack).toBe(true)
    expect(result.status).toBe(200)
    expect(bodyOf(0).thinkHard).toBe(true)
    expect(bodyOf(1)).not.toHaveProperty("thinkHard")
  })

  it("on: a network error retries once in fast mode", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
    const { fellBack } = await fetchConsensusWithFallback(
      messages,
      "en",
      "medium",
      false,
      undefined,
      true
    )
    expect(fellBack).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("on: a good think-hard verdict is kept", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    const { fellBack } = await fetchConsensusWithFallback(
      messages,
      "en",
      "medium",
      false,
      undefined,
      true
    )
    expect(fellBack).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
