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
  FREE_DEBATE_WINDOW_MS,
  getFreeDebateStatus,
  tryClaimFreeServerAccess,
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
    })

    await expect(getFreeDebateStatus("u1")).resolves.toEqual({
      remaining: 1,
      active: false,
      expiresAt: null,
    })
  })

  it("reports active while the free window is open", async () => {
    const expiresAt = new Date("2026-07-15T12:20:00.000Z")
    findUniqueMock.mockResolvedValue({
      freeDebatesRemaining: 0,
      freeDebateExpiresAt: expiresAt,
    })

    await expect(getFreeDebateStatus("u1")).resolves.toEqual({
      remaining: 0,
      active: true,
      expiresAt: expiresAt.toISOString(),
    })
  })

  it("reuses an open free window without decrementing again", async () => {
    findUniqueMock.mockResolvedValue({
      freeDebatesRemaining: 0,
      freeDebateExpiresAt: new Date("2026-07-15T12:20:00.000Z"),
    })

    await expect(tryClaimFreeServerAccess("u1")).resolves.toBe(true)
    expect(updateManyMock).not.toHaveBeenCalled()
  })

  it("claims one remaining grant and opens a window", async () => {
    findUniqueMock.mockResolvedValue({
      freeDebatesRemaining: 1,
      freeDebateExpiresAt: null,
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    await expect(tryClaimFreeServerAccess("u1")).resolves.toBe(true)
    expect(updateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "u1",
          freeDebatesRemaining: { gt: 0 },
        }),
        data: expect.objectContaining({
          freeDebatesRemaining: { decrement: 1 },
          freeDebateExpiresAt: new Date(Date.now() + FREE_DEBATE_WINDOW_MS),
        }),
      })
    )
  })

  it("returns false when remaining is zero and the window is expired", async () => {
    findUniqueMock
      .mockResolvedValueOnce({
        freeDebatesRemaining: 0,
        freeDebateExpiresAt: new Date("2026-07-15T11:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        freeDebatesRemaining: 0,
        freeDebateExpiresAt: new Date("2026-07-15T11:00:00.000Z"),
      })
    updateManyMock.mockResolvedValue({ count: 0 })

    await expect(tryClaimFreeServerAccess("u1")).resolves.toBe(false)
  })

  it("wins a parallel claim race by reading the winner window", async () => {
    findUniqueMock
      .mockResolvedValueOnce({
        freeDebatesRemaining: 1,
        freeDebateExpiresAt: null,
      })
      .mockResolvedValueOnce({
        freeDebatesRemaining: 0,
        freeDebateExpiresAt: new Date("2026-07-15T12:30:00.000Z"),
      })
    updateManyMock.mockResolvedValue({ count: 0 })

    await expect(tryClaimFreeServerAccess("u1")).resolves.toBe(true)
  })
})
