/** Lifetime free-debate grant for signed-in users on host keys. */
import { prisma } from "@/lib/prisma"

// One claim covers chat + consensus + OCR for a full debate.
export const FREE_DEBATE_WINDOW_MS = 30 * 60 * 1000

export type FreeDebateStatus = {
  remaining: number
  active: boolean
  expiresAt: string | null
}

export async function getFreeDebateStatus(userId: string): Promise<FreeDebateStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeDebatesRemaining: true, freeDebateExpiresAt: true },
  })
  if (!user) {
    return { remaining: 0, active: false, expiresAt: null }
  }
  const now = new Date()
  const active = Boolean(user.freeDebateExpiresAt && user.freeDebateExpiresAt > now)
  return {
    remaining: user.freeDebatesRemaining,
    active,
    expiresAt: user.freeDebateExpiresAt?.toISOString() ?? null,
  }
}

/** True if user has an open free window or successfully claims one remaining grant. */
export async function tryClaimFreeServerAccess(userId: string): Promise<boolean> {
  const now = new Date()

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeDebatesRemaining: true, freeDebateExpiresAt: true },
  })
  if (!existing) return false

  if (existing.freeDebateExpiresAt && existing.freeDebateExpiresAt > now) {
    return true
  }

  const expiresAt = new Date(now.getTime() + FREE_DEBATE_WINDOW_MS)
  const claimed = await prisma.user.updateMany({
    where: {
      id: userId,
      freeDebatesRemaining: { gt: 0 },
      OR: [{ freeDebateExpiresAt: null }, { freeDebateExpiresAt: { lte: now } }],
    },
    data: {
      freeDebatesRemaining: { decrement: 1 },
      freeDebateExpiresAt: expiresAt,
    },
  })
  if (claimed.count === 1) return true

  // Parallel claim race: winner already opened the window.
  const again = await prisma.user.findUnique({
    where: { id: userId },
    select: { freeDebateExpiresAt: true },
  })
  return Boolean(again?.freeDebateExpiresAt && again.freeDebateExpiresAt > now)
}
