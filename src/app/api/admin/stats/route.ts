/** Read-only daily aggregates for the owner's dashboard; off (404) unless STATS_API_TOKEN is set. */
import { createHash, timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getDailyBudgetCents, hasDatabase } from "@/lib/host-spend"
import { seoulDay } from "@/lib/seoul-day"

const DEFAULT_DAYS = 14
const MAX_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

const NO_STORE = { "Cache-Control": "no-store" }

type DayRow = {
  day: string
  costCents: number
  costByProvider: Record<string, number>
  calls: number
  visitors: number
  signups: number
}

export function clampDays(raw: string | null): number {
  const n = Number(raw)
  if (raw === null || raw.trim() === "" || !Number.isFinite(n)) return DEFAULT_DAYS
  return Math.min(MAX_DAYS, Math.max(1, Math.floor(n)))
}

function tokenMatches(header: string | null, token: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
  // Hashing first gives equal-length buffers, so the compare never leaks length.
  const a = createHash("sha256").update(given).digest()
  const b = createHash("sha256").update(token).digest()
  return given !== "" && timingSafeEqual(a, b)
}

const cents = (n: number) => Math.round(n * 100) / 100

export async function GET(req: Request) {
  const token = process.env.STATS_API_TOKEN?.trim()
  if (!token) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  if (!tokenMatches(req.headers.get("authorization"), token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE })
  }

  const count = clampDays(new URL(req.url).searchParams.get("days"))
  const now = new Date()
  const today = seoulDay(now)
  const firstMs = Date.parse(`${today}T00:00:00.000+09:00`) - (count - 1) * DAY_MS
  const days = Array.from({ length: count }, (_, i) => seoulDay(new Date(firstMs + i * DAY_MS)))
  const rows = new Map<string, DayRow>(
    days.map((day) => [
      day,
      { day, costCents: 0, costByProvider: {}, calls: 0, visitors: 0, signups: 0 },
    ])
  )
  const budget = { dailyCapCents: getDailyBudgetCents(), todayCountedCents: 0 }
  const tracking: { costSince: string | null; visitorsSince: string | null } = {
    costSince: null,
    visitorsSince: null,
  }
  let users = 0

  if (hasDatabase()) {
    try {
      const [costs, visits, signups, firstCost, firstVisit, spend, userCount] = await Promise.all([
        prisma.hostCostDay.findMany({ where: { day: { gte: days[0] } } }),
        prisma.dailyVisitor.groupBy({
          by: ["day"],
          where: { day: { gte: days[0] } },
          _count: { _all: true },
        }),
        prisma.user.findMany({
          where: { createdAt: { gte: new Date(firstMs) } },
          select: { createdAt: true },
        }),
        prisma.hostCostDay.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
        prisma.dailyVisitor.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
        prisma.hostSpendDay.findUnique({ where: { day: today } }),
        prisma.user.count(),
      ])
      for (const c of costs) {
        const row = rows.get(c.day)
        if (!row) continue
        row.costCents += c.cents
        row.costByProvider[c.provider] = (row.costByProvider[c.provider] ?? 0) + c.cents
        row.calls += c.calls
      }
      for (const v of visits) {
        const row = rows.get(v.day)
        if (row) row.visitors = v._count._all
      }
      for (const u of signups) {
        const row = rows.get(seoulDay(u.createdAt))
        if (row) row.signups += 1
      }
      tracking.costSince = firstCost?.day ?? null
      tracking.visitorsSince = firstVisit?.day ?? null
      budget.todayCountedCents = spend?.centsUsed ?? 0
      users = userCount
    } catch (error) {
      console.error("[admin/stats] query failed:", error instanceof Error ? error.message : error)
      return NextResponse.json({ error: "stats_failed" }, { status: 500, headers: NO_STORE })
    }
  }

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      timezone: "Asia/Seoul",
      budget,
      tracking,
      totals: { users },
      days: days.map((day) => {
        const row = rows.get(day)!
        const byProvider = Object.fromEntries(
          Object.entries(row.costByProvider)
            .map(([p, c]) => [p, cents(c)] as const)
            .filter(([, c]) => c > 0)
        )
        return { ...row, costCents: cents(row.costCents), costByProvider: byProvider }
      }),
    },
    { headers: NO_STORE }
  )
}
