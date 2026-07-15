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
  tryReserveHostSpend,
  utcSpendDay,
} from "@/lib/host-spend"

describe("host spend", () => {
  let previousBudget: string | undefined

  beforeEach(() => {
    previousBudget = process.env.HOST_KEY_DAILY_BUDGET_USD
    delete process.env.HOST_KEY_DAILY_BUDGET_USD
    findUniqueMock.mockReset()
    upsertMock.mockReset()
    updateManyMock.mockReset()
    upsertMock.mockResolvedValue({})
  })

  afterEach(() => {
    if (previousBudget === undefined) delete process.env.HOST_KEY_DAILY_BUDGET_USD
    else process.env.HOST_KEY_DAILY_BUDGET_USD = previousBudget
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
    await expect(tryReserveHostSpend(3)).resolves.toBe(false)
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it("reserves when under budget", async () => {
    updateManyMock.mockResolvedValue({ count: 1 })
    await expect(tryReserveHostSpend(10)).resolves.toBe(true)
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
    await expect(tryReserveHostSpend(10)).resolves.toBe(false)
  })

  it("prices providers conservatively", () => {
    expect(estimateHostCallCents("gemini")).toBeLessThan(estimateHostCallCents("claude"))
    expect(estimateHostCallCents("gpt")).toBeGreaterThan(0)
  })
})
