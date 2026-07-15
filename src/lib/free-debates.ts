/** Lifetime free-debate grant for signed-in users on host keys. */
import { prisma } from "@/lib/prisma"

// Outer bound for one debate's multi-call chat + consensus + OCR.
export const FREE_DEBATE_WINDOW_MS = 30 * 60 * 1000

// Caps host calls per grant so a second debate cannot ride the same window.
export const FREE_DEBATE_MAX_CALLS = 36

export type FreeDebateStatus = {
  remaining: number
  active: boolean
  expiresAt: string | null
  callsRemaining: number
}

function isActiveWindow(
  expiresAt: Date | null | undefined,
  callsRemaining: number,
  now: Date
): boolean {
  return Boolean(expiresAt && expiresAt > now && callsRemaining > 0)
}

export async function getFreeDebateStatus(userId: string): Promise<FreeDebateStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      freeDebatesRemaining: true,
      freeDebateExpiresAt: true,
      freeDebateCallsRemaining: true,
    },
  })
  if (!user) {
    return { remaining: 0, active: false, expiresAt: null, callsRemaining: 0 }
  }
  const now = new Date()
  const active = isActiveWindow(user.freeDebateExpiresAt, user.freeDebateCallsRemaining, now)
  return {
    remaining: user.freeDebatesRemaining,
    active,
    expiresAt: user.freeDebateExpiresAt?.toISOString() ?? null,
    callsRemaining: active ? user.freeDebateCallsRemaining : 0,
  }
}

/** Read-only: grant already open with call budget left (no claim, no consume). */
export async function peekFreeServerAccess(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeDebateExpiresAt: true, freeDebateCallsRemaining: true },
  })
  if (!user) return false
  return isActiveWindow(user.freeDebateExpiresAt, user.freeDebateCallsRemaining, new Date())
}

/**
 * Consume one free host call. Claims a remaining grant if needed, then decrements
 * the per-grant call budget so multi-request debates work without multi-debate abuse.
 */
export async function tryConsumeFreeServerAccess(userId: string): Promise<boolean> {
  const now = new Date()

  // Active window with calls left: burn one call.
  const consumed = await prisma.user.updateMany({
    where: {
      id: userId,
      freeDebateCallsRemaining: { gt: 0 },
      freeDebateExpiresAt: { gt: now },
    },
    data: { freeDebateCallsRemaining: { decrement: 1 } },
  })
  if (consumed.count === 1) return true

  // Claim a new grant and take the first call.
  const expiresAt = new Date(now.getTime() + FREE_DEBATE_WINDOW_MS)
  const claimed = await prisma.user.updateMany({
    where: {
      id: userId,
      freeDebatesRemaining: { gt: 0 },
      OR: [
        { freeDebateExpiresAt: null },
        { freeDebateExpiresAt: { lte: now } },
        { freeDebateCallsRemaining: { lte: 0 } },
      ],
    },
    data: {
      freeDebatesRemaining: { decrement: 1 },
      freeDebateExpiresAt: expiresAt,
      freeDebateCallsRemaining: FREE_DEBATE_MAX_CALLS - 1,
    },
  })
  if (claimed.count === 1) return true

  // Parallel race: another request may have opened the window - try consume again.
  const raced = await prisma.user.updateMany({
    where: {
      id: userId,
      freeDebateCallsRemaining: { gt: 0 },
      freeDebateExpiresAt: { gt: now },
    },
    data: { freeDebateCallsRemaining: { decrement: 1 } },
  })
  return raced.count === 1
}

/** @deprecated use tryConsumeFreeServerAccess */
export const tryClaimFreeServerAccess = tryConsumeFreeServerAccess
