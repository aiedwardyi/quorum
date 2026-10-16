import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"

const streamClaudeMock = vi.hoisted(() => vi.fn())
const resolveKeyMock = vi.hoisted(() => vi.fn())
const generateGeminiVerdictMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/providers/claude", () => ({
  streamClaude: streamClaudeMock,
  generateClaudeVerdict: vi.fn(),
}))
vi.mock("@/lib/providers/gpt", () => ({ streamGPT: vi.fn(), generateGptVerdict: vi.fn() }))
vi.mock("@/lib/providers/perplexity", () => ({
  streamPerplexity: vi.fn(),
  generatePerplexityVerdict: vi.fn(),
}))
vi.mock("@/lib/server-provider-keys", () => ({
  resolveUserProviderApiKey: resolveKeyMock,
  isValidAccessCode: () => false,
}))
vi.mock("@/lib/consensus-resolve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/consensus-resolve")>()),
  resolveConsensusCandidates: vi.fn(async () => ({
    candidates: [{ provider: "gemini", apiKey: "user-gemini-key" }],
    lookupFailed: false,
  })),
}))
vi.mock("@/lib/providers/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/gemini")>()),
  generateGeminiVerdictWithApiKey: generateGeminiVerdictMock,
}))

import { POST as chatPOST } from "@/app/api/chat/route"
import { POST as consensusPOST } from "@/app/api/consensus/route"
import { NextRequest } from "next/server"

const messages: Message[] = [
  {
    id: "u1",
    sender: "user",
    displayName: "You",
    content: "E11.9 vs E11.65?",
    timestamp: new Date(0),
  },
  { id: "c1", sender: "claude", displayName: "Claude", content: "E11.65.", timestamp: new Date(0) },
  { id: "g1", sender: "gemini", displayName: "Gemini", content: "E11.65.", timestamp: new Date(0) },
]

const validVerdict = {
  recommendedAnswer: "Code E11.65 when hyperglycemia is documented.",
  voteSplit: "2/2 unanimous",
  confidence: 90,
  reasons: ["Documented hyperglycemia"],
  minorityView: "E11.9 if not documented.",
  oppositeCase: "No hyperglycemia in the record.",
}

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function events(res: Response): Promise<Record<string, unknown>[]> {
  const text = await res.text()
  return text
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)))
}

describe("chat route think hard", () => {
  beforeEach(() => {
    streamClaudeMock.mockReset().mockImplementation(async function* () {
      yield "E11.65 means hyperglycemia."
    })
    resolveKeyMock.mockReset().mockResolvedValue({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("off: calls the provider exactly as before (no think flag, normal token cap)", async () => {
    await events(await chatPOST(post("/api/chat", { messages, provider: "claude" })))
    const args = streamClaudeMock.mock.calls[0]
    expect(args[3]).toBe(2048)
    expect(args[5]).toBe(false)
    expect(resolveKeyMock.mock.calls[0][4]).toEqual({ thinkHard: false })
  })

  it("on: passes the flag, thinking headroom, and the think-hard spend estimate", async () => {
    await events(
      await chatPOST(post("/api/chat", { messages, provider: "claude", thinkHard: true }))
    )
    const args = streamClaudeMock.mock.calls[0]
    expect(args[3]).toBe(2048 + 8192)
    expect(args[5]).toBe(true)
    expect(resolveKeyMock.mock.calls[0][4]).toEqual({ thinkHard: true })
  })

  it("ignores a model name or a non-boolean flag from the client", async () => {
    await events(
      await chatPOST(
        post("/api/chat", {
          messages,
          provider: "claude",
          thinkHard: "true",
          model: "claude-fable-5-1",
        })
      )
    )
    expect(streamClaudeMock.mock.calls[0][5]).toBe(false)
    expect(streamClaudeMock.mock.calls[0]).toHaveLength(6)
  })

  async function runWithClock(advanceMs: number) {
    const res = await chatPOST(post("/api/chat", { messages, provider: "claude", thinkHard: true }))
    const pending = events(res)
    await vi.advanceTimersByTimeAsync(advanceMs)
    return pending
  }

  it("on: no first text within 25s ends in an error event so the client falls back", async () => {
    vi.useFakeTimers()
    streamClaudeMock.mockImplementation(async function* () {
      await new Promise((r) => setTimeout(r, 30_000))
      yield "too late"
    })
    const evs = await runWithClock(26_000)
    expect(evs.some((e) => e.done)).toBe(false)
    expect(evs.at(-1)).toEqual({ error: "think_hard_timeout" })
  })

  it("on: a stream still writing past 25s completes with no error", async () => {
    vi.useFakeTimers()
    streamClaudeMock.mockImplementation(async function* () {
      yield "Started on time. "
      await new Promise((r) => setTimeout(r, 40_000))
      yield "Finished later."
    })
    const evs = await runWithClock(45_000)
    expect(evs.some((e) => e.error)).toBe(false)
    expect(evs.at(-1)).toMatchObject({ done: true, content: "Started on time. Finished later." })
  })

  it("on: a stream past the 120s safety cap ends in an error event", async () => {
    vi.useFakeTimers()
    streamClaudeMock.mockImplementation(async function* () {
      yield "Started. "
      await new Promise((r) => setTimeout(r, 200_000))
      yield "never"
    })
    const evs = await runWithClock(121_000)
    expect(evs.at(-1)).toEqual({ error: "think_hard_timeout" })
  })
})

describe("consensus route think hard", () => {
  beforeEach(() => {
    generateGeminiVerdictMock.mockReset().mockResolvedValue(JSON.stringify(validVerdict))
  })

  it("off: Gemini verdict keeps thinking budget 0", async () => {
    const res = await consensusPOST(post("/api/consensus", { messages }))
    expect(res.status).toBe(200)
    const config = generateGeminiVerdictMock.mock.calls[0][0].generationConfig
    expect(config.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it("on: Gemini verdict runs with LOW thinking on the same model", async () => {
    const res = await consensusPOST(post("/api/consensus", { messages, thinkHard: true }))
    expect(res.status).toBe(200)
    const call = generateGeminiVerdictMock.mock.calls[0][0]
    expect(call.modelName).toBe("gemini-3.8-flash")
    expect(call.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "LOW" })
  })
})
