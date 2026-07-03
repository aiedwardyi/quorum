// Browser localStorage BYOK helpers: round-trips, clear, status, SSR guard.
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getClientKey,
  setClientKey,
  clearClientKey,
  clearAllClientKeys,
  getClientKeyStatus,
} from "@/lib/client-api-keys"

function stubBrowser() {
  const store = new Map<string, string>()
  vi.stubGlobal("window", {})
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
}

describe("client-api-keys", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("round-trips a key through set/get", () => {
    stubBrowser()
    expect(getClientKey("gemini")).toBe("")
    setClientKey("gemini", "my-gemini-key")
    expect(getClientKey("gemini")).toBe("my-gemini-key")
  })

  it("clears a single provider key", () => {
    stubBrowser()
    setClientKey("gpt", "my-gpt-key")
    clearClientKey("gpt")
    expect(getClientKey("gpt")).toBe("")
  })

  it("clearAll removes every provider key", () => {
    stubBrowser()
    setClientKey("gemini", "g")
    setClientKey("claude", "c")
    clearAllClientKeys()
    expect(getClientKey("gemini")).toBe("")
    expect(getClientKey("claude")).toBe("")
  })

  it("status reflects which providers have keys", () => {
    stubBrowser()
    setClientKey("gemini", "g")
    const status = getClientKeyStatus()
    expect(status.gemini).toBe(true)
    expect(status.claude).toBe(false)
    expect(status.gpt).toBe(false)
    expect(status.perplexity).toBe(false)
  })

  it("returns empty string during SSR (no window)", () => {
    vi.stubGlobal("window", undefined)
    expect(getClientKey("gemini")).toBe("")
    expect(getClientKeyStatus().gemini).toBe(false)
  })
})
