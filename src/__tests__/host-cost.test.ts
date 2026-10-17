import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const upsertMock = vi.hoisted(() => vi.fn())
const createMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({ prisma: { hostCostDay: { upsert: upsertMock } } }))
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } }
  },
}))

import { logHostCost, logHostUsage, usageCents } from "@/lib/host-cost"
import { MODEL_PRICES } from "@/lib/model-prices"
import { claudeUsage } from "@/lib/providers/claude"
import { geminiUsage } from "@/lib/providers/gemini"
import { gptUsage, streamGPT } from "@/lib/providers/gpt"
import { perplexityUsage } from "@/lib/providers/perplexity"
import type { Message } from "@/types"

const DAY = "2026-10-17"

describe("usage cents", () => {
  it("claude bills cache reads and writes at their own rates", () => {
    const usage = claudeUsage("claude-opus-5-5", {
      input_tokens: 16,
      output_tokens: 639,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 1262,
    } as never)
    // (16*4 + 1000*0.2 + 1262*5 + 639*20) / 1e6 USD
    expect(usageCents(usage, DAY)).toBeCloseTo(((64 + 200 + 6310 + 12780) / 1e6) * 100, 6)
  })

  it("claude haiku switches to long-context rates over 100k prompt tokens", () => {
    const usage = { model: "claude-haiku-5-5", inputTokens: 120_000, outputTokens: 0 }
    expect(usageCents(usage, DAY)).toBeCloseTo(((120_000 * 0.5) / 1e6) * 100, 6)
  })

  it("gpt splits cached input out of prompt tokens; reasoning is in completion", () => {
    const usage = gptUsage("gpt-6.1-sol", {
      prompt_tokens: 1000,
      completion_tokens: 300,
      total_tokens: 1300,
      prompt_tokens_details: { cached_tokens: 400 },
    })
    expect(usage).toMatchObject({ inputTokens: 600, cacheReadTokens: 400, outputTokens: 300 })
    expect(usageCents(usage, DAY)).toBeCloseTo(((600 * 2 + 400 * 0.1 + 300 * 10) / 1e6) * 100, 6)
  })

  it("gemini bills thinking tokens as output and doubles on 2027-01-01", () => {
    const usage = geminiUsage({
      promptTokenCount: 852,
      candidatesTokenCount: 200,
      thoughtsTokenCount: 147,
    })!
    expect(usage).toMatchObject({ inputTokens: 852, outputTokens: 347 })
    const now = ((852 * 0.75 + 347 * 3.75) / 1e6) * 100
    expect(usageCents(usage, DAY)).toBeCloseTo(now, 6)
    expect(usageCents(usage, "2027-01-01")).toBeCloseTo(now * 2, 6)
  })

  it("perplexity uses its own total cost when the response has it", () => {
    const usage = perplexityUsage("sonar-pro", {
      prompt_tokens: 798,
      completion_tokens: 201,
      cost: { total_cost: 0.00319 },
    })!
    expect(usageCents(usage, DAY)).toBeCloseTo(0.319, 6)
  })

  it("perplexity falls back to tokens x price plus the request fee when cost is 0", () => {
    const usage = perplexityUsage("sonar-reasoning-pro", {
      prompt_tokens: 800,
      completion_tokens: 200,
      cost: { total_cost: 0 },
    })!
    expect(usage.costUsd).toBeUndefined()
    expect(usageCents(usage, DAY)).toBeCloseTo(((800 * 2 + 200 * 8) / 1e6 + 0.006) * 100, 6)
  })

  it("an unknown model warns and counts 0", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(usageCents({ model: "mystery-1", inputTokens: 1000, outputTokens: 1000 }, DAY)).toBe(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("mystery-1"))
    warn.mockRestore()
  })

  it("every priced model names a source and a checked date", () => {
    for (const price of Object.values(MODEL_PRICES)) {
      expect(price.source).toMatch(/^https:\/\//)
      expect(price.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe("log host cost", () => {
  let previousDatabaseUrl: string | undefined

  beforeEach(() => {
    previousDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = "postgresql://test/db"
    upsertMock.mockReset().mockResolvedValue({})
  })

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  })

  it("adds cents and one call to the UTC day row for the provider", async () => {
    logHostCost("search", 0.5)
    await vi.waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    const day = new Date().toISOString().slice(0, 10)
    expect(upsertMock.mock.calls[0][0]).toEqual({
      where: { day_provider: { day, provider: "search" } },
      create: { day, provider: "search", cents: 0.5, calls: 1 },
      update: { cents: { increment: 0.5 }, calls: { increment: 1 } },
    })
  })

  it("is a no-op without a database", async () => {
    delete process.env.DATABASE_URL
    logHostCost("gemini", 1)
    await new Promise((r) => setTimeout(r, 0))
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("a failing write is caught and never throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    upsertMock.mockRejectedValueOnce(new Error("db down"))
    expect(() =>
      logHostUsage("gpt", { model: "gpt-4o", inputTokens: 10, outputTokens: 10 })
    ).not.toThrow()
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    error.mockRestore()
  })

  it("skips a call that reported no usage", async () => {
    logHostUsage("claude", undefined)
    await new Promise((r) => setTimeout(r, 0))
    expect(upsertMock).not.toHaveBeenCalled()
  })
})

describe("gpt include_usage", () => {
  const messages: Message[] = [
    { id: "u", sender: "user", displayName: "You", content: "Hi", timestamp: new Date(0) },
  ]

  async function* chunks() {
    yield { choices: [{ delta: { content: "Hello " } }] }
    yield { choices: [{ delta: { content: "there." } }] }
    yield { choices: [], usage: { prompt_tokens: 50, completion_tokens: 3, total_tokens: 53 } }
  }

  it("asks for usage and leaves the answer text unchanged", async () => {
    createMock.mockReset().mockResolvedValue(chunks())
    const onUsage = vi.fn()
    let text = ""
    for await (const c of streamGPT("sys", messages, undefined, 100, "k", false, onUsage)) {
      text += c
    }
    expect(text).toBe("Hello there.")
    expect(createMock.mock.calls[0][0].stream_options).toEqual({ include_usage: true })
    expect(onUsage).toHaveBeenCalledWith({
      model: "gpt-4o",
      inputTokens: 50,
      outputTokens: 3,
      cacheReadTokens: 0,
    })
  })
})
