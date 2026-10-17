import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { COST_WRITE_CAP_MS, type UsageSink } from "@/lib/host-cost"
import type { Message } from "@/types"

const upsertMock = vi.hoisted(() => vi.fn())
const streamClaudeMock = vi.hoisted(() => vi.fn())
const resolveKeyMock = vi.hoisted(() => vi.fn())
const candidatesMock = vi.hoisted(() => vi.fn())
const geminiVerdictMock = vi.hoisted(() => vi.fn())
const geminiContentMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hostCostDay: { upsert: upsertMock },
    hostSpendDay: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}))
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
  resolveConsensusCandidates: candidatesMock,
}))
vi.mock("@/lib/providers/gemini", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers/gemini")>()),
  generateGeminiVerdictWithApiKey: geminiVerdictMock,
  generateGoogleAiContentWithApiKey: geminiContentMock,
}))

import { POST as chatPOST } from "@/app/api/chat/route"
import { POST as consensusPOST } from "@/app/api/consensus/route"
import { POST as searchPOST } from "@/app/api/search/route"
import { POST as ocrPOST } from "@/app/api/ocr/route"
import { readChatStream } from "@/hooks/useDebateEngine"
import { NextRequest } from "next/server"

const messages: Message[] = [
  { id: "u1", sender: "user", displayName: "You", content: "E11.9?", timestamp: new Date(0) },
  { id: "c1", sender: "claude", displayName: "Claude", content: "E11.65.", timestamp: new Date(0) },
  { id: "g1", sender: "gemini", displayName: "Gemini", content: "E11.65.", timestamp: new Date(0) },
]

const verdict = JSON.stringify({
  recommendedAnswer: "Code E11.65.",
  voteSplit: "2/2 unanimous",
  confidence: 90,
  reasons: ["Documented hyperglycemia"],
  minorityView: "E11.9.",
  oppositeCase: "No hyperglycemia.",
})

const haikuUsage = { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200 }
const flashUsage = { model: "gemini-3.8-flash", inputTokens: 1000, outputTokens: 200 }

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function doneEvent(res: Response): Promise<Record<string, unknown> | undefined> {
  const text = await res.text()
  return text
    .split("\n\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)))
    .find((e) => e.done)
}

const flush = () => new Promise((r) => setTimeout(r, 0))
const slowWrite = (onWritten: () => void) => () =>
  new Promise((resolve) =>
    setTimeout(() => {
      onWritten()
      resolve({})
    }, 20)
  )
const loggedProviders = () => upsertMock.mock.calls.map((c) => c[0].create.provider)

describe("host cost logging in routes", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ["DATABASE_URL", "GEMINI_API_KEY", "PERPLEXITY_API_KEY"])
      saved[k] = process.env[k]
    process.env.DATABASE_URL = "postgresql://test/db"
    process.env.GEMINI_API_KEY = "test-host-gemini"
    process.env.PERPLEXITY_API_KEY = "test-host-pplx"
    upsertMock.mockReset().mockResolvedValue({})
    streamClaudeMock.mockReset().mockImplementation(async function* (...args: unknown[]) {
      const onUsage = args[6] as UsageSink
      yield "E11.65 means "
      yield "hyperglycemia."
      onUsage(haikuUsage)
    })
    resolveKeyMock.mockReset().mockResolvedValue({})
    candidatesMock.mockReset().mockResolvedValue({
      candidates: [{ provider: "gemini" }],
      lookupFailed: false,
    })
    geminiVerdictMock.mockReset().mockImplementation(async (args: { onUsage?: UsageSink }) => {
      args.onUsage?.(flashUsage)
      return verdict
    })
    geminiContentMock.mockReset().mockImplementation(async (args: { onUsage?: UsageSink }) => {
      args.onUsage?.(flashUsage)
      return "page text"
    })
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("chat on a host key logs the seat's cost after the stream", async () => {
    await doneEvent(await chatPOST(post("/api/chat", { messages, provider: "claude" })))
    await vi.waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    const { create } = upsertMock.mock.calls[0][0]
    expect(create.provider).toBe("claude")
    expect(create.cents).toBeCloseTo(((1000 * 0.1 + 200 * 0.5) / 1e6) * 100, 6)
  })

  it("chat closes the stream only after the cost write lands", async () => {
    let written = false
    upsertMock.mockImplementation(slowWrite(() => (written = true)))
    await (await chatPOST(post("/api/chat", { messages, provider: "claude" }))).text()
    expect(written).toBe(true)
  })

  it("a cost write that never lands still closes the stream at the cap", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    let started!: () => void
    const writeStarted = new Promise<void>((r) => (started = r))
    upsertMock.mockImplementation(() => {
      started()
      return new Promise(() => {})
    })
    const res = await chatPOST(post("/api/chat", { messages, provider: "claude" }))
    let closed = false
    const done = doneEvent(res).finally(() => (closed = true))
    await writeStarted
    await vi.advanceTimersByTimeAsync(COST_WRITE_CAP_MS - 1)
    expect(closed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect((await done)?.content).toBe("E11.65 means hyperglycemia.")
  })

  it("chat on a user key logs nothing", async () => {
    resolveKeyMock.mockResolvedValue({ userApiKey: "sk-user" })
    await doneEvent(await chatPOST(post("/api/chat", { messages, provider: "claude" })))
    await flush()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("a failing cost write still returns the full answer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    upsertMock.mockRejectedValue(new Error("db down"))
    const done = await doneEvent(
      await chatPOST(post("/api/chat", { messages, provider: "claude" }))
    )
    expect(done?.content).toBe("E11.65 means hyperglycemia.")
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    error.mockRestore()
  })

  it("the verdict logs under whichever provider answered on a host key", async () => {
    const res = await consensusPOST(post("/api/consensus", { messages }))
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(loggedProviders()).toEqual(["gemini"]))
  })

  it("the verdict on a user key logs nothing", async () => {
    candidatesMock.mockResolvedValue({
      candidates: [{ provider: "gemini", apiKey: "user-gemini" }],
      lookupFailed: false,
    })
    const res = await consensusPOST(post("/api/consensus", { messages }))
    expect(res.status).toBe(200)
    await flush()
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("search logs $5 per 1k requests on a host key only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
    )
    await searchPOST(post("/api/search", { query: "E11.65" }))
    await vi.waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    expect(upsertMock.mock.calls[0][0].create).toMatchObject({ provider: "search", cents: 0.5 })

    resolveKeyMock.mockResolvedValue({ userApiKey: "pplx-user" })
    await searchPOST(post("/api/search", { query: "E11.65" }))
    await flush()
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it("search waits for its cost write before answering", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
    )
    let written = false
    upsertMock.mockImplementation(slowWrite(() => (written = true)))
    await searchPOST(post("/api/search", { query: "E11.65" }))
    expect(written).toBe(true)
  })

  it("ocr on a host key logs gemini", async () => {
    const res = await ocrPOST(post("/api/ocr", { images: ["aGVsbG8="] }))
    expect(res.status).toBe(200)
    await vi.waitFor(() => expect(loggedProviders()).toEqual(["gemini"]))
  })
})

describe("client chat stream", () => {
  it("returns on done while the body stays open", async () => {
    const cancel = vi.fn()
    const events = [{ chunk: "E11.65." }, { done: true, content: "E11.65." }]
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const sse = events
          .map(
            (e) => `data: ${JSON.stringify(e)}

`
          )
          .join("")
        controller.enqueue(new TextEncoder().encode(sse))
      },
      cancel,
    })
    const r = await readChatStream(
      body,
      () => {},
      () => false
    )
    expect(r).toMatchObject({ finalContent: "E11.65.", cancelled: false })
    expect(cancel).not.toHaveBeenCalled()
  })
})
