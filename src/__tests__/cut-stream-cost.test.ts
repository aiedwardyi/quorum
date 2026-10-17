import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ModelUsage } from "@/lib/host-cost"
import type { Message } from "@/types"

const upsertMock = vi.hoisted(() => vi.fn())
const gptCreateMock = vi.hoisted(() => vi.fn())
const claudeCreateMock = vi.hoisted(() => vi.fn())
const resolveKeyMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({ prisma: { hostCostDay: { upsert: upsertMock } } }))
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: gptCreateMock } }
  },
}))
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: claudeCreateMock }
  },
}))
vi.mock("@/lib/server-provider-keys", () => ({
  resolveUserProviderApiKey: resolveKeyMock,
  isValidAccessCode: () => false,
}))

import { estimateTokens, streamUsage } from "@/lib/host-cost"
import { streamClaude } from "@/lib/providers/claude"
import { geminiUsage } from "@/lib/providers/gemini"
import { POST as chatPOST } from "@/app/api/chat/route"

const messages: Message[] = [
  { id: "u", sender: "user", displayName: "You", content: "Hi", timestamp: new Date(0) },
]

const SENTENCE = "Prior authorization needs a documented BMI and a failed diet trial. "

describe("estimates", () => {
  it("counts ASCII at 4 chars a token and non-ASCII at 1 each", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens("abcdefgh")).toBe(2)
    expect(estimateTokens("abcde")).toBe(2)
    expect(estimateTokens("젖산산증")).toBe(4)
    expect(estimateTokens("eGFR 30 미만")).toBe(2 + 2)
  })

  it("fills only what the provider hasn't reported", () => {
    const seen: ModelUsage[] = []
    const usage = streamUsage("gpt-4o", "a".repeat(400), (u) => seen.push(u))
    usage.started()
    expect(seen.at(-1)).toEqual({ model: "gpt-4o", inputTokens: 100, outputTokens: 0 })
    usage.text("b".repeat(10))
    usage.text("b".repeat(10))
    expect(seen.at(-1)?.outputTokens).toBe(5)
    usage.exact({ inputTokens: 90, cacheReadTokens: 10 })
    expect(seen.at(-1)).toEqual({
      model: "gpt-4o",
      inputTokens: 90,
      cacheReadTokens: 10,
      outputTokens: 5,
    })
    usage.exact({ outputTokens: 7 })
    expect(seen.at(-1)?.outputTokens).toBe(7)
  })

  it("a Vertex chunk with no counts reports nothing", () => {
    expect(geminiUsage({})).toBeUndefined()
  })
})

describe("claude streams", () => {
  const start = {
    type: "message_start",
    message: {
      usage: {
        input_tokens: 120,
        output_tokens: 1,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 20,
      },
    },
  }
  const text = (t: string) => ({
    type: "content_block_delta",
    delta: { type: "text_delta", text: t },
  })

  async function* events() {
    yield start
    yield { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "abcd" } }
    yield text("abcdefgh")
    yield text("ijklmnop")
    yield { type: "message_delta", usage: { output_tokens: 42 } }
  }

  beforeEach(() => {
    claudeCreateMock.mockReset().mockResolvedValue(events())
  })

  it("a cut stream keeps exact input and cache counts and estimates output", async () => {
    const seen: ModelUsage[] = []
    for await (const chunk of streamClaude("s", messages, undefined, 100, "k", false, (u) =>
      seen.push(u)
    )) {
      expect(chunk).toBe("abcdefgh")
      break
    }
    expect(seen.at(-1)).toEqual({
      model: "claude-haiku-5-5",
      inputTokens: 120,
      cacheReadTokens: 50,
      cacheWriteTokens: 20,
      // "abcd" thinking + "abcdefgh" text = 12 ASCII chars.
      outputTokens: 3,
    })
  })

  it("a full stream logs the exact numbers with no estimate", async () => {
    const seen: ModelUsage[] = []
    let out = ""
    for await (const chunk of streamClaude("s", messages, undefined, 100, "k", false, (u) =>
      seen.push(u)
    )) {
      out += chunk
    }
    expect(out).toBe("abcdefghijklmnop")
    expect(seen.at(-1)).toEqual({
      model: "claude-haiku-5-5",
      inputTokens: 120,
      cacheReadTokens: 50,
      cacheWriteTokens: 20,
      outputTokens: 42,
    })
  })
})

describe("gpt word-cap abort through the chat route", () => {
  const saved: Record<string, string | undefined> = {}

  async function* longAnswer() {
    for (let i = 0; i < 40; i++) yield { choices: [{ delta: { content: SENTENCE } }] }
    yield { choices: [], usage: { prompt_tokens: 900, completion_tokens: 480, total_tokens: 1380 } }
  }

  async function answer(): Promise<string> {
    gptCreateMock.mockReset().mockImplementation(async () => longAnswer())
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, provider: "gpt" }),
    })
    const raw = await (await chatPOST(req)).text()
    const done = raw
      .split("\n\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)))
      .find((e) => e.done)
    return done.content
  }

  beforeEach(() => {
    for (const k of ["DATABASE_URL", "OPENAI_API_KEY"]) saved[k] = process.env[k]
    process.env.DATABASE_URL = "postgresql://test/db"
    process.env.OPENAI_API_KEY = "test-host-openai"
    upsertMock.mockReset().mockResolvedValue({})
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it("logs one estimated call and leaves the answer unchanged", async () => {
    resolveKeyMock.mockReset().mockResolvedValue({ userApiKey: "sk-user" })
    const byok = await answer()
    await new Promise((r) => setTimeout(r, 0))
    expect(upsertMock).not.toHaveBeenCalled()

    resolveKeyMock.mockReset().mockResolvedValue({})
    const host = await answer()
    expect(host).toBe(byok)
    expect(host.split(/\s+/).length).toBeLessThanOrEqual(170)

    await vi.waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    const { create } = upsertMock.mock.calls[0][0]
    expect(create.provider).toBe("gpt")
    expect(create.calls).toBe(1)
    expect(create.cents).toBeGreaterThan(0)
  })
})
