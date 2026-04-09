import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getDebateCount,
  incrementDebateCount,
  shouldShowLoginGate,
  FREE_DEBATE_LIMIT,
  savePendingDebate,
  loadPendingDebate,
} from "@/components/LoginGate"

const localStore: Record<string, string> = {}
const sessionStore: Record<string, string> = {}

beforeEach(() => {
  Object.keys(localStore).forEach((k) => delete localStore[k])
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k])

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => localStore[k] ?? null,
    setItem: (k: string, v: string) => { localStore[k] = v },
    removeItem: (k: string) => { delete localStore[k] },
  })
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => sessionStore[k] ?? null,
    setItem: (k: string, v: string) => { sessionStore[k] = v },
    removeItem: (k: string) => { delete sessionStore[k] },
  })
})

describe("getDebateCount", () => {
  it("returns 0 when no counter exists", () => {
    expect(getDebateCount()).toBe(0)
  })
  it("returns stored count", () => {
    localStore["quorum_debate_count"] = "3"
    expect(getDebateCount()).toBe(3)
  })
  it("returns 0 for malformed value", () => {
    localStore["quorum_debate_count"] = "abc"
    expect(getDebateCount()).toBe(0)
  })
})

describe("incrementDebateCount", () => {
  it("increments from 0 to 1", () => {
    incrementDebateCount()
    expect(localStore["quorum_debate_count"]).toBe("1")
  })
  it("increments from existing value", () => {
    localStore["quorum_debate_count"] = "2"
    incrementDebateCount()
    expect(localStore["quorum_debate_count"]).toBe("3")
  })
})

describe("shouldShowLoginGate", () => {
  it("returns false when count < limit and not logged in", () => {
    expect(shouldShowLoginGate(false)).toBe(false)
  })
  it("returns true when count >= limit and not logged in", () => {
    localStore["quorum_debate_count"] = String(FREE_DEBATE_LIMIT)
    expect(shouldShowLoginGate(false)).toBe(true)
  })
  it("returns false when logged in regardless of count", () => {
    localStore["quorum_debate_count"] = "100"
    expect(shouldShowLoginGate(true)).toBe(false)
  })
})

describe("savePendingDebate / loadPendingDebate", () => {
  it("round-trips pending debate config", () => {
    const config = {
      prompt: "test prompt",
      originalPrompt: "test prompt",
      hadFiles: false,
      models: ["gemini", "claude"],
      responseLength: "medium",
      rounds: 5,
      locale: "en",
    }
    savePendingDebate(config)
    const loaded = loadPendingDebate()
    expect(loaded).toEqual(config)
  })
  it("returns null when no pending debate", () => {
    expect(loadPendingDebate()).toBeNull()
  })
  it("clears pending debate after loading", () => {
    savePendingDebate({ prompt: "test", originalPrompt: "test", hadFiles: false, models: ["gemini"], responseLength: "short", rounds: 3, locale: "en" })
    loadPendingDebate()
    expect(loadPendingDebate()).toBeNull()
  })
})
