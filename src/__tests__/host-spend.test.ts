import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const findUniqueMock = vi.hoisted(() => vi.fn())
const upsertMock = vi.hoisted(() => vi.fn())
const updateManyMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    hostSpendDay: {
      findUnique: findUniqueMock,
      upsert: upsertMock,
      updateMany: updateManyMock,
    },
  },
}))

import {
  estimateHostCallCents,
  getDailyBudgetCents,
  getHostSpendStatus,
  releaseHostSpend,
  tryReserveHostSpend,
  utcSpendDay,
} from "@/lib/host-spend"

describe("host spend", () => {
  let previousBudget: string | undefined
  let previousDatabaseUrl: string | undefined

  beforeEach(() => {
    previousBudget = process.env.HOST_KEY_DAILY_BUDGET_USD
    previousDatabaseUrl = process.env.DATABASE_URL
    delete process.env.HOST_KEY_DAILY_BUDGET_USD
    process.env.DATABASE_URL = "postgresql://test/db"
    findUniqueMock.mockReset()
    upsertMock.mockReset()
    updateManyMock.mockReset()
    upsertMock.mockResolvedValue({})
  })

  afterEach(() => {
    if (previousBudget === undefined) delete process.env.HOST_KEY_DAILY_BUDGET_USD
    else process.env.HOST_KEY_DAILY_BUDGET_USD = previousBudget
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  })

  it("defaults the daily budget to $25", () => {
    expect(getDailyBudgetCents()).toBe(2500)
  })

  it("reads HOST_KEY_DAILY_BUDGET_USD", () => {
    process.env.HOST_KEY_DAILY_BUDGET_USD = "30"
    expect(getDailyBudgetCents()).toBe(3000)
  })

  it("blocks host keys when budget is 0", async () => {
    process.env.HOST_KEY_DAILY_BUDGET_USD = "0"
    await expect(tryReserveHostSpend(3)).resolves.toEqual({
      ok: false,
      day: utcSpendDay(),
      cents: 3,
    })
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it("reserves when under budget", async () => {
    updateManyMock.mockResolvedValue({ count: 1 })
    await expect(tryReserveHostSpend(10)).resolves.toEqual({
      ok: true,
      day: utcSpendDay(),
      cents: 10,
    })
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { centsUsed: { increment: 0 } },
      })
    )
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          day: utcSpendDay(),
          centsUsed: { lte: 2490 },
        }),
        data: { centsUsed: { increment: 10 } },
      })
    )
  })

  it("rejects when the day is already at the cap", async () => {
    updateManyMock.mockResolvedValue({ count: 0 })
    await expect(tryReserveHostSpend(10)).resolves.toMatchObject({ ok: false })
  })

  it("prices providers conservatively", () => {
    expect(estimateHostCallCents("gemini")).toBeLessThan(estimateHostCallCents("claude"))
    expect(estimateHostCallCents("gpt")).toBeGreaterThan(0)
  })

  it("scales estimates by units", () => {
    expect(estimateHostCallCents("gemini", 4)).toBe(estimateHostCallCents("gemini") * 4)
  })

  it("allows host keys when DATABASE_URL is unset", async () => {
    delete process.env.DATABASE_URL
    await expect(tryReserveHostSpend(10)).resolves.toMatchObject({ ok: true })
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it("releases against the reserved day", async () => {
    updateManyMock.mockResolvedValue({ count: 1 })
    await releaseHostSpend(10, "2026-07-14")
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { day: "2026-07-14", centsUsed: { gte: 10 } },
        data: { centsUsed: { decrement: 10 } },
      })
    )
  })

  it("reports remaining budget in status", async () => {
    findUniqueMock.mockResolvedValue({ centsUsed: 400 })
    await expect(getHostSpendStatus()).resolves.toEqual({
      day: utcSpendDay(),
      centsUsed: 400,
      budgetCents: 2500,
      remainingCents: 2100,
    })
  })
})
