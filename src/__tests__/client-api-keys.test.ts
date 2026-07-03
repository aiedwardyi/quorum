// Browser localStorage BYOK helpers: round-trips, clear, status, SSR guard.
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  getClientKey,
  setClientKey,
  clearClientKey,
  clearAllClientKeys,
  getClientKeyStatus,
  shouldUseClientKeys,
  isSessionResolving,
  shouldClearClientKeys,
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

describe("shouldUseClientKeys", () => {
  it("always uses client keys when auth is disabled", () => {
    expect(shouldUseClientKeys(false, "loading")).toBe(true)
    expect(shouldUseClientKeys(false, "unauthenticated")).toBe(true)
    expect(shouldUseClientKeys(false, "authenticated")).toBe(true)
  })

  it("uses client keys only when definitively unauthenticated with auth enabled", () => {
    expect(shouldUseClientKeys(true, "unauthenticated")).toBe(true)
  })

  it("withholds client keys while the session is still loading", () => {
    expect(shouldUseClientKeys(true, "loading")).toBe(false)
  })

  it("withholds client keys for a signed-in session", () => {
    expect(shouldUseClientKeys(true, "authenticated")).toBe(false)
  })
})

describe("isSessionResolving", () => {
  it("is never resolving when auth is disabled", () => {
    expect(isSessionResolving(false, "loading")).toBe(false)
    expect(isSessionResolving(false, "unauthenticated")).toBe(false)
    expect(isSessionResolving(false, "authenticated")).toBe(false)
  })

  it("is resolving only while an auth-enabled session is still loading", () => {
    expect(isSessionResolving(true, "loading")).toBe(true)
  })

  it("is settled once an auth-enabled session resolves either way", () => {
    expect(isSessionResolving(true, "unauthenticated")).toBe(false)
    expect(isSessionResolving(true, "authenticated")).toBe(false)
  })
})

describe("shouldClearClientKeys", () => {
  it("clears local keys on login only when account auth is enabled", () => {
    expect(shouldClearClientKeys(true, true)).toBe(true)
  })

  it("keeps local keys when auth is disabled even if a stale session reads as logged-in", () => {
    expect(shouldClearClientKeys(false, true)).toBe(false)
  })

  it("keeps local keys for an anonymous visitor", () => {
    expect(shouldClearClientKeys(true, false)).toBe(false)
    expect(shouldClearClientKeys(false, false)).toBe(false)
  })
})
