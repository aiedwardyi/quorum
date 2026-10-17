import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const createManyMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({ prisma: { dailyVisitor: { createMany: createManyMock } } }))

import { POST, visitHash } from "@/app/api/visit/route"
import { sendDailyVisit } from "@/lib/visit-beacon"

const ID = "3b241101-e2bb-4255-8caf-4136c566a962"

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  )
}

describe("visit route", () => {
  let previousDatabaseUrl: string | undefined

  beforeEach(() => {
    previousDatabaseUrl = process.env.DATABASE_URL
    process.env.DATABASE_URL = "postgresql://test/db"
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-17T03:12:00.000Z"))
    createManyMock.mockReset().mockResolvedValue({ count: 1 })
  })

  afterEach(() => {
    vi.useRealTimers()
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  })

  it("stores only sha256(day:id), skips duplicates, sets no cookie and returns 204", async () => {
    const res = await post({ id: ID })
    expect(res.status).toBe(204)
    expect(res.headers.get("set-cookie")).toBeNull()
    const hash = createHash("sha256").update(`2026-10-17:${ID}`).digest("hex")
    expect(createManyMock).toHaveBeenCalledWith({
      data: [{ hash, day: "2026-10-17" }],
      skipDuplicates: true,
    })
    expect(JSON.stringify(createManyMock.mock.calls)).not.toContain(ID)
  })

  it("the same browser hashes the same within a day and differently the next", () => {
    expect(visitHash("2026-10-17", ID)).toBe(visitHash("2026-10-17", ID.toUpperCase()))
    expect(visitHash("2026-10-18", ID)).not.toBe(visitHash("2026-10-17", ID))
  })

  it("rejects anything that isn't a UUID", async () => {
    for (const body of [{}, { id: 42 }, { id: "not-a-uuid" }, { id: `${ID}x` }, "nope", null]) {
      expect((await post(body)).status).toBe(400)
    }
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it("is a no-op without a database", async () => {
    delete process.env.DATABASE_URL
    expect((await post({ id: ID })).status).toBe(204)
    expect(createManyMock).not.toHaveBeenCalled()
  })

  it("a failing write still returns 204", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    createManyMock.mockRejectedValue(new Error("db down"))
    expect((await post({ id: ID })).status).toBe(204)
    error.mockRestore()
  })
})

describe("visit beacon", () => {
  let store: Map<string, string>
  const fetchMock = vi.fn()

  beforeEach(() => {
    store = new Map()
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sends a stable random id once per UTC day", async () => {
    await sendDailyVisit(new Date("2026-10-17T01:00:00Z"))
    await sendDailyVisit(new Date("2026-10-17T23:00:00Z"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const id = JSON.parse(fetchMock.mock.calls[0][1].body).id
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    await sendDailyVisit(new Date("2026-10-18T00:00:00Z"))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).id).toBe(id)
  })

  it("fails silently and retries on the next load", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"))
    await expect(sendDailyVisit(new Date("2026-10-17T01:00:00Z"))).resolves.toBeUndefined()
    await sendDailyVisit(new Date("2026-10-17T02:00:00Z"))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never throws when storage is blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError")
      },
    })
    await expect(sendDailyVisit()).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
