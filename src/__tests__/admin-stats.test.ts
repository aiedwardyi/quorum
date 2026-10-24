import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const costFindMany = vi.hoisted(() => vi.fn())
const costFindFirst = vi.hoisted(() => vi.fn())
const visitGroupBy = vi.hoisted(() => vi.fn())
const visitFindFirst = vi.hoisted(() => vi.fn())
const userFindMany = vi.hoisted(() => vi.fn())
const userCount = vi.hoisted(() => vi.fn())
const spendFindUnique = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hostCostDay: { findMany: costFindMany, findFirst: costFindFirst },
    dailyVisitor: { groupBy: visitGroupBy, findFirst: visitFindFirst },
    user: { findMany: userFindMany, count: userCount },
    hostSpendDay: { findUnique: spendFindUnique },
  },
}))

import { GET, clampDays } from "@/app/api/admin/stats/route"

const TOKEN = "a".repeat(64)

function get(query = "", auth: string | null = `Bearer ${TOKEN}`) {
  const headers = new Headers()
  if (auth !== null) headers.set("Authorization", auth)
  return GET(new Request(`http://localhost/api/admin/stats${query}`, { headers }))
}

describe("admin stats", () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ["STATS_API_TOKEN", "DATABASE_URL", "HOST_KEY_DAILY_BUDGET_USD"]) {
      saved[k] = process.env[k]
    }
    process.env.STATS_API_TOKEN = TOKEN
    process.env.DATABASE_URL = "postgresql://test/db"
    process.env.HOST_KEY_DAILY_BUDGET_USD = "40"
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-17T03:12:00.000Z"))
    costFindMany.mockReset().mockResolvedValue([])
    costFindFirst.mockReset().mockResolvedValue(null)
    visitGroupBy.mockReset().mockResolvedValue([])
    visitFindFirst.mockReset().mockResolvedValue(null)
    userFindMany.mockReset().mockResolvedValue([])
    userCount.mockReset().mockResolvedValue(0)
    spendFindUnique.mockReset().mockResolvedValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it("is a 404 when the token is unset or blank", async () => {
    delete process.env.STATS_API_TOKEN
    expect((await get()).status).toBe(404)
    process.env.STATS_API_TOKEN = "   "
    const res = await get()
    expect(res.status).toBe(404)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
  })

  it("is a 401 for a missing, wrong or non-bearer token", async () => {
    for (const auth of [null, "Bearer ", `Bearer ${"b".repeat(64)}`, `Bearer ${TOKEN}x`, TOKEN]) {
      const res = await get("", auth)
      expect(res.status).toBe(401)
      expect(res.headers.get("Cache-Control")).toBe("no-store")
    }
    expect(costFindMany).not.toHaveBeenCalled()
  })

  it("clamps days to 1-90 and defaults to 14", () => {
    expect(clampDays(null)).toBe(14)
    expect(clampDays("")).toBe(14)
    expect(clampDays("abc")).toBe(14)
    expect(clampDays("0")).toBe(1)
    expect(clampDays("-5")).toBe(1)
    expect(clampDays("2.7")).toBe(2)
    expect(clampDays("500")).toBe(90)
    expect(clampDays("30")).toBe(30)
  })

  it("zero-fills Seoul days oldest to today with null tracking when nothing is logged", async () => {
    const res = await get("?days=3")
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("no-store")
    const body = await res.json()
    expect(body).toEqual({
      generatedAt: "2026-10-17T03:12:00.000Z",
      timezone: "Asia/Seoul",
      budget: { dailyCapCents: 4000, todayCountedCents: 0 },
      tracking: { costSince: null, visitorsSince: null },
      totals: { users: 0 },
      days: ["2026-10-15", "2026-10-16", "2026-10-17"].map((day) => ({
        day,
        costCents: 0,
        costByProvider: {},
        calls: 0,
        visitors: 0,
        signups: 0,
      })),
    })
  })

  it("defaults to 14 days and clamps an oversize request to 90", async () => {
    expect((await (await get()).json()).days).toHaveLength(14)
    const days = (await (await get("?days=999")).json()).days
    expect(days).toHaveLength(90)
    expect(days[0].day).toBe("2026-07-20")
    expect(days[89].day).toBe("2026-10-17")
  })

  it("ends on today's Seoul date once UTC is still on yesterday", async () => {
    vi.setSystemTime(new Date("2026-10-17T15:00:00.000Z"))
    const body = await (await get("?days=2")).json()
    expect(body.timezone).toBe("Asia/Seoul")
    expect(body.days.map((d: { day: string }) => d.day)).toEqual(["2026-10-17", "2026-10-18"])
    expect(spendFindUnique.mock.calls[0][0]).toEqual({ where: { day: "2026-10-18" } })
  })

  it("rolls up cost, calls, visitors and sign-ups per day", async () => {
    costFindMany.mockResolvedValue([
      { day: "2026-10-17", provider: "claude", cents: 20.123, calls: 10 },
      { day: "2026-10-17", provider: "search", cents: 2, calls: 4 },
      { day: "2026-10-17", provider: "gpt", cents: 0, calls: 1 },
      { day: "2026-10-16", provider: "gemini", cents: 1.006, calls: 2 },
    ])
    costFindFirst.mockResolvedValue({ day: "2026-10-16" })
    visitGroupBy.mockResolvedValue([{ day: "2026-10-17", _count: { _all: 3 } }])
    visitFindFirst.mockResolvedValue({ day: "2026-10-17" })
    userFindMany.mockResolvedValue([
      { createdAt: new Date("2026-10-16T14:59:59.000Z") },
      { createdAt: new Date("2026-10-16T15:00:00.000Z") },
    ])
    userCount.mockResolvedValue(4)
    spendFindUnique.mockResolvedValue({ day: "2026-10-17", centsUsed: 1230 })

    const body = await (await get("?days=2")).json()
    expect(body.budget).toEqual({ dailyCapCents: 4000, todayCountedCents: 1230 })
    expect(body.tracking).toEqual({ costSince: "2026-10-16", visitorsSince: "2026-10-17" })
    expect(body.totals).toEqual({ users: 4 })
    expect(body.days).toEqual([
      {
        day: "2026-10-16",
        costCents: 1.01,
        costByProvider: { gemini: 1.01 },
        calls: 2,
        visitors: 0,
        signups: 1,
      },
      {
        day: "2026-10-17",
        costCents: 22.12,
        costByProvider: { claude: 20.12, search: 2 },
        calls: 15,
        visitors: 3,
        signups: 1,
      },
    ])
    expect(costFindMany.mock.calls[0][0]).toEqual({ where: { day: { gte: "2026-10-16" } } })
    expect(userFindMany.mock.calls[0][0]).toEqual({
      where: { createdAt: { gte: new Date("2026-10-15T15:00:00.000Z") } },
      select: { createdAt: true },
    })
  })

  it("a database failure is a 500 with no detail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    costFindMany.mockRejectedValue(new Error("secret connection string"))
    const res = await get()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "stats_failed" })
    error.mockRestore()
  })
})
