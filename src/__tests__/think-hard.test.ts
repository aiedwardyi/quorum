import { describe, it, expect, vi } from "vitest"
import { createThinkStripper } from "@/lib/strip-think"
import {
  THINK_HARD_COPY,
  THINK_HARD_STORAGE_KEY,
  ThinkHardTimeoutError,
  parseStoredThinkHard,
  withThinkHardDeadlines,
  withFastFallback,
} from "@/lib/think-hard"
import { estimateHostCallCents } from "@/lib/host-spend"
import { USER_API_KEY_PROVIDERS } from "@/types"

function strip(chunks: string[]): string {
  const s = createThinkStripper()
  return chunks.map((c) => s.push(c)).join("") + s.flush()
}

describe("createThinkStripper", () => {
  it("passes plain text through unchanged", () => {
    expect(strip(["E11.9 is ", "type 2 diabetes ", "without complications."])).toBe(
      "E11.9 is type 2 diabetes without complications."
    )
  })

  it("drops a leading think block", () => {
    expect(strip(["<think>weigh the codes</think>\n\nE11.65 means hyperglycemia."])).toBe(
      "\n\nE11.65 means hyperglycemia."
    )
  })

  it("drops think blocks whose tags split across chunks", () => {
    expect(strip(["<thi", "nk>reason", "ing</th", "ink>Answer", " here."])).toBe("Answer here.")
  })

  it("keeps text around a mid-stream think block", () => {
    expect(strip(["Before <think>x</think>after."])).toBe("Before after.")
  })

  it("never emits an unclosed think block", () => {
    expect(strip(["<think>still reasoning when the stream ended"])).toBe("")
  })

  it("releases a held-back '<' that was not a tag", () => {
    expect(strip(["a <", "b"])).toBe("a <b")
    expect(strip(["ends with <"])).toBe("ends with <")
  })
})

describe("withThinkHardDeadlines", () => {
  async function* chunks(delays: number[]) {
    for (const [i, ms] of delays.entries()) {
      await new Promise((r) => setTimeout(r, ms))
      yield `c${i}`
    }
  }

  async function collect(it: AsyncIterable<string>, seen: string[]) {
    for await (const chunk of it) seen.push(chunk)
  }

  it("times out when the first text misses its window", async () => {
    const seen: string[] = []
    await expect(
      collect(withThinkHardDeadlines(chunks([100]), 50, 1_000), seen)
    ).rejects.toBeInstanceOf(ThinkHardTimeoutError)
    expect(seen).toEqual([])
  })

  it("lets a stream that started in time keep writing past the first-text window", async () => {
    const seen: string[] = []
    await collect(withThinkHardDeadlines(chunks([10, 100, 100]), 50, 1_000), seen)
    expect(seen).toEqual(["c0", "c1", "c2"])
  })

  it("still stops a stream that outlives the safety cap", async () => {
    const seen: string[] = []
    await expect(
      collect(withThinkHardDeadlines(chunks([10, 100, 100]), 50, 150), seen)
    ).rejects.toBeInstanceOf(ThinkHardTimeoutError)
    expect(seen).toEqual(["c0", "c1"])
  })
})

describe("withFastFallback", () => {
  it("runs only the fast attempt when think hard is off", async () => {
    const attempt = vi.fn(async (th: boolean) => (th ? "think" : "fast"))
    expect(await withFastFallback(false, attempt, () => false)).toEqual({
      result: "fast",
      fellBack: false,
    })
    expect(attempt.mock.calls).toEqual([[false]])
  })

  it("keeps a successful think-hard result", async () => {
    const attempt = vi.fn(async (th: boolean) => (th ? "think" : "fast"))
    expect(await withFastFallback(true, attempt, () => false)).toEqual({
      result: "think",
      fellBack: false,
    })
    expect(attempt.mock.calls).toEqual([[true]])
  })

  it("retries once in fast mode when the think-hard result failed", async () => {
    const attempt = vi.fn(async (th: boolean) => (th ? "failed" : "fast"))
    expect(await withFastFallback(true, attempt, (r) => r === "failed")).toEqual({
      result: "fast",
      fellBack: true,
    })
    expect(attempt.mock.calls).toEqual([[true], [false]])
  })

  it("retries once in fast mode when the think-hard attempt throws", async () => {
    const attempt = vi.fn(async (th: boolean) => {
      if (th) throw new Error("504")
      return "fast"
    })
    expect(await withFastFallback(true, attempt, () => false)).toEqual({
      result: "fast",
      fellBack: true,
    })
  })
})

describe("think hard toggle", () => {
  it("defaults off and only reads a stored 'true' as on", () => {
    expect(THINK_HARD_STORAGE_KEY).toBe("quorum_thinkHard")
    expect(parseStoredThinkHard(null)).toBe(false)
    expect(parseStoredThinkHard("false")).toBe(false)
    expect(parseStoredThinkHard("1")).toBe(false)
    expect(parseStoredThinkHard("true")).toBe(true)
  })

  it("has the label, hint, thinking and fallback copy in both locales", () => {
    expect(THINK_HARD_COPY.en.label).toBe("Think hard")
    expect(THINK_HARD_COPY.ko.label).toBe("깊이 생각")
    expect(THINK_HARD_COPY.en.hint).toBe("Slower, more careful answers")
    expect(THINK_HARD_COPY.ko.hint).toBe("느리지만 더 신중한 답변")
    expect(THINK_HARD_COPY.en.thinking).toBe("Thinking…")
    expect(THINK_HARD_COPY.ko.thinking).toBe("생각 중…")
    expect(THINK_HARD_COPY.en.fellBack).toBe("Think hard took too long, so this is a quick answer.")
    expect(THINK_HARD_COPY.ko.fellBack).toBe("깊이 생각이 너무 오래 걸려 빠른 답변으로 대신했어요.")
  })
})

describe("think hard host spend", () => {
  it("keeps fast estimates unchanged", () => {
    expect(estimateHostCallCents("gemini")).toBe(3)
    expect(estimateHostCallCents("claude")).toBe(10)
    expect(estimateHostCallCents("gpt")).toBe(8)
    expect(estimateHostCallCents("perplexity")).toBe(6)
  })

  it("never estimates a think-hard call below its fast call", () => {
    for (const p of USER_API_KEY_PROVIDERS) {
      expect(estimateHostCallCents(p, 1, true)).toBeGreaterThanOrEqual(estimateHostCallCents(p))
    }
  })
})
