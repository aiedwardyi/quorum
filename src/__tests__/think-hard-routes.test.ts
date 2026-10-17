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
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
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
import { POST as searchPOST } from "@/app/api/search/route"
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

  it("tells panelists not to guess exact terms in both modes and phases", async () => {
    const line =
      "Never invent facts, names, drug names, codes, or criteria. If you're not sure of an exact name, number, or code, say so instead of guessing."
    for (const thinkHard of [false, true]) {
      for (const phase of ["opening", "rebuttal"]) {
        streamClaudeMock.mockClear()
        await events(
          await chatPOST(post("/api/chat", { messages, provider: "claude", thinkHard, phase }))
        )
        const prompt = streamClaudeMock.mock.calls[0][0] as string
        expect(prompt).toContain(line)
        expect(prompt).toContain("Do NOT include citations")
      }
    }
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
    expect(streamClaudeMock.mock.calls[0]).toHaveLength(7)
    expect(typeof streamClaudeMock.mock.calls[0][6]).toBe("function")
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

describe("consensus route web sources", () => {
  const sources = [
    {
      title: "T".repeat(300),
      url: "https://example.gov/e11",
      snippet: "E11.65 with hyperglycemia",
    },
    { title: "bad", url: "javascript:alert(1)", snippet: "x" },
  ]

  beforeEach(() => {
    generateGeminiVerdictMock.mockReset().mockResolvedValue(JSON.stringify(validVerdict))
  })

  it("fast mode ignores sources: same prompts as a request without them", async () => {
    await consensusPOST(post("/api/consensus", { messages }))
    await consensusPOST(post("/api/consensus", { messages, sources }))
    const [plain, withSources] = generateGeminiVerdictMock.mock.calls.map((c) => c[0])
    expect(withSources.userPrompt).toBe(plain.userPrompt)
    expect(withSources.systemPrompt).toBe(plain.systemPrompt)
    expect(plain.userPrompt).not.toContain("Web sources")
  })

  it("think hard adds the capped sources block and keeps the schema", async () => {
    const res = await consensusPOST(post("/api/consensus", { messages, thinkHard: true, sources }))
    expect(res.status).toBe(200)
    const call = generateGeminiVerdictMock.mock.calls[0][0]
    expect(call.userPrompt).toContain("Web sources (may be incomplete or off-topic)")
    expect(call.userPrompt).toContain("https://example.gov/e11")
    expect(call.userPrompt).toContain(`${"T".repeat(200)} (`)
    expect(call.userPrompt).not.toContain("T".repeat(201))
    expect(call.userPrompt).not.toContain("javascript:")
    expect(call.userPrompt).toContain("minorityView")
    expect(call.generationConfig.responseSchema.required).toContain("recommendedAnswer")
  })

  it("think hard without sources sends no block", async () => {
    await consensusPOST(post("/api/consensus", { messages, thinkHard: true }))
    expect(generateGeminiVerdictMock.mock.calls[0][0].userPrompt).not.toContain("Web sources")
  })
})

describe("search route", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resolveKeyMock.mockReset().mockResolvedValue({ userApiKey: "user-pplx-key" })
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("gates like chat for Perplexity with the search estimate", async () => {
    await searchPOST(post("/api/search", { query: "q", accessCode: "c", userApiKey: "k" }))
    expect(resolveKeyMock).toHaveBeenCalledWith("perplexity", "search", "k", "c", { cents: 1 })
  })

  it("returns whatever the gate rejects with and never calls upstream", async () => {
    resolveKeyMock.mockResolvedValue({
      blockedResponse: Response.json({ error: "no_key", provider: "perplexity" }, { status: 402 }),
    })
    const res = await searchPOST(post("/api/search", { query: "q" }))
    expect(res.status).toBe(402)
    expect(await res.json()).toEqual({ error: "no_key", provider: "perplexity" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rejects a missing or oversize query", async () => {
    expect((await searchPOST(post("/api/search", {}))).status).toBe(400)
    expect((await searchPOST(post("/api/search", { query: "a".repeat(401) }))).status).toBe(400)
    expect(resolveKeyMock).not.toHaveBeenCalled()
  })

  it("returns capped http(s) sources from Perplexity", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        id: "x",
        results: [
          { title: "A", url: "https://a.com", snippet: "S".repeat(900), date: null },
          { title: "B", url: "file:///etc/passwd", snippet: "" },
        ],
      })
    )
    const res = await searchPOST(post("/api/search", { query: "semaglutide PA" }))
    const { sources } = await res.json()
    expect(sources).toEqual([{ title: "A", url: "https://a.com/", snippet: "S".repeat(500) }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.perplexity.ai/search")
    expect(init.headers.Authorization).toBe("Bearer user-pplx-key")
    expect(JSON.parse(init.body)).toMatchObject({ query: "semaglutide PA", max_results: 5 })
  })

  it("any upstream failure is 200 with no sources", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(new Response("down", { status: 503 }))
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
    for (let i = 0; i < 2; i++) {
      const res = await searchPOST(post("/api/search", { query: "q" }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ sources: [] })
    }
  })
})
