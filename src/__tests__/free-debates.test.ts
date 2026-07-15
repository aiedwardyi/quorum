import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const findUniqueMock = vi.hoisted(() => vi.fn())
const updateManyMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: findUniqueMock,
      updateMany: updateManyMock,
    },
  },
}))

import {
  FREE_DEBATE_MAX_CALLS,
  FREE_DEBATE_WINDOW_MS,
  getFreeDebateStatus,
  peekFreeServerAccess,
  tryConsumeFreeServerAccess,
} from "@/lib/free-debates"

describe("free debates", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"))
    findUniqueMock.mockReset()
    updateManyMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("reports remaining and inactive when no window is open", async () => {
    findUniqueMock.mockResolvedValue({
      freeDebatesRemaining: 1,
      freeDebateExpiresAt: null,
      freeDebateCallsRemaining: 0,
    })

    await expect(getFreeDebateStatus("u1")).resolves.toEqual({
      remaining: 1,
      active: false,
      expiresAt: null,
      callsRemaining: 0,
    })
  })

  it("reports active only when the window is open and calls remain", async () => {
    const expiresAt = new Date("2026-07-15T12:20:00.000Z")
    findUniqueMock.mockResolvedValue({
      freeDebatesRemaining: 0,
      freeDebateExpiresAt: expiresAt,
      freeDebateCallsRemaining: 10,
    })

    await expect(getFreeDebateStatus("u1")).resolves.toEqual({
      remaining: 0,
      active: true,
      expiresAt: expiresAt.toISOString(),
      callsRemaining: 10,
    })
  })

  it("peek is true only with an open window and calls left", async () => {
    findUniqueMock.mockResolvedValue({
      freeDebateExpiresAt: new Date("2026-07-15T12:20:00.000Z"),
      freeDebateCallsRemaining: 4,
    })
    await expect(peekFreeServerAccess("u1")).resolves.toBe(true)

    findUniqueMock.mockResolvedValue({
      freeDebateExpiresAt: new Date("2026-07-15T12:20:00.000Z"),
      freeDebateCallsRemaining: 0,
    })
    await expect(peekFreeServerAccess("u1")).resolves.toBe(false)
  })

  it("consumes one call from an open window without reclaiming", async () => {
    updateManyMock.mockResolvedValueOnce({ count: 1 })

    await expect(tryConsumeFreeServerAccess("u1")).resolves.toBe(true)
    expect(updateManyMock).toHaveBeenCalledTimes(1)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "u1",
          freeDebateCallsRemaining: { gt: 0 },
        }),
        data: { freeDebateCallsRemaining: { decrement: 1 } },
      })
    )
  })

  it("claims a grant when no window is open and seeds the call budget", async () => {
    updateManyMock
      .mockResolvedValueOnce({ count: 0 }) // consume miss
      .mockResolvedValueOnce({ count: 1 }) // claim hit

    await expect(tryConsumeFreeServerAccess("u1")).resolves.toBe(true)
    expect(updateManyMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "u1",
          freeDebatesRemaining: { gt: 0 },
        }),
        data: expect.objectContaining({
          freeDebatesRemaining: { decrement: 1 },
          freeDebateExpiresAt: new Date(Date.now() + FREE_DEBATE_WINDOW_MS),
          freeDebateCallsRemaining: FREE_DEBATE_MAX_CALLS - 1,
        }),
      })
    )
  })

  it("returns false when grant and call budget are exhausted", async () => {
    updateManyMock
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 })

    await expect(tryConsumeFreeServerAccess("u1")).resolves.toBe(false)
  })

  it("recovers from a parallel claim race by consuming the winner window", async () => {
    updateManyMock
      .mockResolvedValueOnce({ count: 0 }) // first consume miss
      .mockResolvedValueOnce({ count: 0 }) // claim miss (lost race)
      .mockResolvedValueOnce({ count: 1 }) // second consume hit

    await expect(tryConsumeFreeServerAccess("u1")).resolves.toBe(true)
  })
})
