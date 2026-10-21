import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ModelUsage } from "@/lib/host-cost"
import type { Message } from "@/types"

const streamMock = vi.hoisted(() => vi.fn())
const contentMock = vi.hoisted(() => vi.fn())
const claudeVerdictMock = vi.hoisted(() => vi.fn())
const candidatesMock = vi.hoisted(() => vi.fn())

vi.mock("@google-cloud/vertexai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google-cloud/vertexai")>()),
  VertexAI: class {
    getGenerativeModel({ model }: { model: string }) {
      return {
        generateContentStream: (req: unknown) => streamMock(model, req),
        generateContent: (req: unknown) => contentMock(model, req),
      }
    }
  },
}))
vi.mock("@/lib/vertex-config", () => ({ getVertexConfig: () => ({ projectId: "test" }) }))
vi.mock("@/lib/google-credentials", () => ({
  loadGoogleApplicationCredentialsJson: () => undefined,
}))
vi.mock("@/lib/host-spend", () => ({
  estimateHostCallCents: () => 1,
  releaseHostSpend: vi.fn(),
  tryReserveHostSpend: async () => ({ ok: true, cents: 1, day: "2026-10-21" }),
}))
vi.mock("@/lib/host-cost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host-cost")>()),
  logHostUsage: vi.fn(),
}))
vi.mock("@/lib/providers/claude", () => ({
  streamClaude: vi.fn(),
  generateClaudeVerdict: claudeVerdictMock,
}))
vi.mock("@/lib/providers/gpt", () => ({ streamGPT: vi.fn(), generateGptVerdict: vi.fn() }))
vi.mock("@/lib/providers/perplexity", () => ({
  streamPerplexity: vi.fn(),
  generatePerplexityVerdict: vi.fn(),
}))
vi.mock("@/lib/consensus-resolve", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/consensus-resolve")>()),
  resolveConsensusCandidates: candidatesMock,
}))

import { NextRequest } from "next/server"

// Fresh modules per test so one test's 3.8 cooldown never leaks into the next.
let GEMINI_FIRST_TEXT_MS: number
let streamGemini: typeof import("@/lib/providers/gemini").streamGemini
let consensusPOST: typeof import("@/app/api/consensus/route").POST

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

const rateLimited = () =>
  Promise.reject(new Error("[VertexAI.ClientError]: got status: 429 RESOURCE_EXHAUSTED"))
const never = () => new Promise(() => {})

function streamOf(text: string) {
  return {
    stream: (async function* () {
      yield { candidates: [{ content: { parts: [{ text }] } }] }
    })(),
  }
}

function contentOf(text: string) {
  return { response: { candidates: [{ content: { parts: [{ text }] } }] } }
}

async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let out = ""
  for await (const chunk of gen) out += chunk
  return out
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/consensus", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  vi.resetModules()
  ;({ GEMINI_FIRST_TEXT_MS, streamGemini } = await import("@/lib/providers/gemini"))
  ;({ POST: consensusPOST } = await import("@/app/api/consensus/route"))
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  streamMock.mockReset()
  contentMock.mockReset()
  claudeVerdictMock.mockReset()
  candidatesMock.mockReset().mockResolvedValue({
    candidates: [{ provider: "gemini" }, { provider: "claude" }],
    lookupFailed: false,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("Gemini panelist fallback", () => {
  it("a healthy 3.8 reply never touches the fallback model", async () => {
    streamMock.mockImplementation(async () => streamOf("Ok."))
    expect(await drain(streamGemini("sys", messages))).toBe("Ok.")
    expect(streamMock.mock.calls.map((c) => c[0])).toEqual(["gemini-3.8-flash"])
  })

  it("a 3.8 rate limit is answered by 2.5 Flash with thinking off", async () => {
    streamMock.mockImplementation((model: string) =>
      model === "gemini-3.8-flash" ? rateLimited() : Promise.resolve(streamOf("Fallback."))
    )
    expect(await drain(streamGemini("sys", messages))).toBe("Fallback.")
    const [, fallback] = streamMock.mock.calls
    expect(fallback[0]).toBe("gemini-2.5-flash")
    expect(fallback[1].generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it("a 3.8 stall past the first-text deadline is answered by 2.5 Flash", async () => {
    vi.useFakeTimers()
    streamMock.mockImplementation((model: string) =>
      model === "gemini-3.8-flash" ? never() : Promise.resolve(streamOf("Fallback."))
    )
    const pending = drain(streamGemini("sys", messages))
    await vi.advanceTimersByTimeAsync(GEMINI_FIRST_TEXT_MS)
    expect(await pending).toBe("Fallback.")
  })

  it("an empty 3.8 reply is redone on 2.5 Flash, think hard on a token budget", async () => {
    streamMock.mockImplementation(async (model: string) =>
      model === "gemini-3.8-flash" ? streamOf("") : streamOf("Fallback.")
    )
    expect(await drain(streamGemini("sys", messages, undefined, 2048, undefined, true))).toBe(
      "Fallback."
    )
    expect(streamMock.mock.calls[1][1].generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 1024,
    })
  })

  it("after a 3.8 failure the next seat goes straight to 2.5 Flash", async () => {
    streamMock.mockImplementation((model: string) =>
      model === "gemini-3.8-flash" ? rateLimited() : Promise.resolve(streamOf("Fallback."))
    )
    await drain(streamGemini("sys", messages))
    streamMock.mockClear()
    expect(await drain(streamGemini("sys", messages))).toBe("Fallback.")
    expect(streamMock.mock.calls.map((c) => c[0])).toEqual(["gemini-2.5-flash"])
  })

  it("fallback usage is priced on the model that answered", async () => {
    streamMock.mockImplementation((model: string) =>
      model === "gemini-3.8-flash" ? rateLimited() : Promise.resolve(streamOf("Fallback."))
    )
    let last: ModelUsage | undefined
    await drain(streamGemini("sys", messages, undefined, 1024, undefined, false, (u) => (last = u)))
    expect(last?.model).toBe("gemini-2.5-flash")
  })
})

describe("Gemini verdict fallback", () => {
  it("a 3.8 rate limit is answered by 2.5 Flash before Claude", async () => {
    contentMock.mockImplementation((model: string) =>
      model === "gemini-3.8-flash" ? rateLimited() : Promise.resolve(contentOf(verdict))
    )
    const res = await consensusPOST(post({ messages }))
    expect(res.status).toBe(200)
    expect(contentMock.mock.calls.map((c) => c[0])).toEqual([
      "gemini-3.8-flash",
      "gemini-2.5-flash",
    ])
    expect(claudeVerdictMock).not.toHaveBeenCalled()
  })

  it("a follow-up verdict with both Gemini models stalled still reaches Claude in time", async () => {
    vi.useFakeTimers()
    contentMock.mockImplementation(never)
    claudeVerdictMock.mockResolvedValue(verdict)
    const followUp = [
      ...messages,
      {
        id: "v1",
        sender: "verdict",
        displayName: "Verdict",
        content: "E11.65",
        timestamp: new Date(0),
      },
    ] as Message[]
    const pending = consensusPOST(post({ messages: followUp }))
    await vi.advanceTimersByTimeAsync(27_000)
    const res = await pending
    expect(res.status).toBe(200)
    expect(claudeVerdictMock).toHaveBeenCalled()
  })
})
