import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"
import { sanitizeSources, searchQueryFor } from "@/lib/web-sources"
import {
  awaitSources,
  fetchConsensusWithFallback,
  fetchSources,
  startVerdictSearch,
} from "@/hooks/useDebateEngine"

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const source = { title: "Wegovy criteria", url: "https://example.gov/wegovy", snippet: "BMI 30" }

describe("sanitizeSources", () => {
  it("drops non-http URLs and caps count and field sizes", () => {
    const out = sanitizeSources([
      { title: "x", url: "javascript:alert(1)", snippet: "" },
      { title: "x", url: "ftp://example.com/a", snippet: "" },
      { title: "x", url: "not a url", snippet: "" },
      { title: "T".repeat(300), url: "https://a.com/1", snippet: "S".repeat(900) },
      ...Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, url: `http://b.com/${i}` })),
    ])
    expect(out).toHaveLength(5)
    expect(out.every((s) => /^https?:\/\//.test(s.url))).toBe(true)
    expect(out[0].title).toHaveLength(200)
    expect(out[0].snippet).toHaveLength(500)
    expect(out[1].snippet).toBe("")
  })

  it("returns [] for anything but an array", () => {
    expect(sanitizeSources(undefined)).toEqual([])
    expect(sanitizeSources({ url: "https://a.com" })).toEqual([])
  })
})

describe("searchQueryFor", () => {
  it("skips long messages and attached documents", () => {
    expect(searchQueryFor("Is E11.65 right?")).toBe("Is E11.65 right?")
    expect(searchQueryFor("a".repeat(401))).toBeNull()
    expect(searchQueryFor("Check this\n--- File: claim.pdf ---\ntext")).toBeNull()
  })
})

describe("startVerdictSearch", () => {
  it("fast mode makes no search request", () => {
    expect(startVerdictSearch("Q?", false, 4, false)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("think hard makes exactly one /api/search call with the question", async () => {
    fetchMock.mockResolvedValue(json({ sources: [source] }))
    const sources = await startVerdictSearch("Semaglutide PA criteria?", true, 4, false)
    expect(sources).toEqual([source])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/search")
    expect(JSON.parse(init.body)).toEqual({ query: "Semaglutide PA criteria?" })
  })

  it("skips documents and single-model sends", () => {
    expect(startVerdictSearch("Q\n--- File: a.pdf ---", true, 4, false)).toBeNull()
    expect(startVerdictSearch("Q?", true, 1, false)).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("fetchSources", () => {
  it("never throws: 402, 500, network error and empty all give []", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "no_key" }, 402))
    expect(await fetchSources("q", false)).toEqual([])
    fetchMock.mockResolvedValueOnce(json({}, 500))
    expect(await fetchSources("q", false)).toEqual([])
    fetchMock.mockRejectedValueOnce(new Error("offline"))
    expect(await fetchSources("q", false)).toEqual([])
    fetchMock.mockResolvedValueOnce(json({ sources: [] }))
    expect(await fetchSources("q", false)).toEqual([])
  })
})

describe("awaitSources", () => {
  it("gives up after the grace window", async () => {
    vi.useFakeTimers()
    const pending = awaitSources(new Promise(() => {}), 2_000)
    await vi.advanceTimersByTimeAsync(2_001)
    expect(await pending).toEqual([])
  })

  it("passes through sources that arrive in time", async () => {
    expect(await awaitSources(Promise.resolve([source]))).toEqual([source])
    expect(await awaitSources(null)).toEqual([])
  })
})

describe("fetchConsensusWithFallback sources", () => {
  const msgs: Message[] = [
    { id: "u", sender: "user", displayName: "You", content: "Q?", timestamp: new Date(0) },
  ]

  it("fast mode verdict request is unchanged and carries no sources", async () => {
    fetchMock.mockResolvedValue(json({}))
    await fetchConsensusWithFallback(msgs, "en", "medium", false, ["gemini", "claude"], false, [
      source,
    ])
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(Object.keys(body).sort()).toEqual(
      ["locale", "messages", "preferredProviders", "responseLength"].sort()
    )
  })

  it("think hard verdict carries the sources; its fast retry does not", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({}))
    const { fellBack } = await fetchConsensusWithFallback(
      msgs,
      "en",
      "medium",
      false,
      ["gemini"],
      true,
      [source]
    )
    expect(fellBack).toBe(true)
    const think = JSON.parse(fetchMock.mock.calls[0][1].body)
    const fast = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(think).toMatchObject({ thinkHard: true, sources: [source] })
    expect(fast.sources).toBeUndefined()
    expect(fast.thinkHard).toBeUndefined()
  })

  it("think hard with no sources sends none", async () => {
    fetchMock.mockResolvedValue(json({}))
    await fetchConsensusWithFallback(msgs, "en", "medium", false, ["gemini"], true, [])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sources).toBeUndefined()
  })
})
