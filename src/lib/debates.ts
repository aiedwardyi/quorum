import { prisma } from "@/lib/prisma"
import type { Provider } from "@/types"

// ---- USER TEST MODE ----
// Set to true to give everyone unlimited debates + all models.
// TODO: Remove after user testing week.
const USER_TEST_MODE = true
// -------------------------

const FREE_MONTHLY_LIMIT = 10
const FREE_MODELS: Provider[] = ["gpt", "perplexity", "gemini"]
const ALL_MODELS: Provider[] = ["gpt", "perplexity", "gemini", "claude"]

export async function getOrCreateBalance(userId: string) {
  return prisma.userDebateBalance.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      freeDebatesResetAt: getNextResetDate(),
    },
  })
}

export async function getBalanceInfo(userId: string) {
  if (USER_TEST_MODE) {
    return {
      tier: "paid" as const,
      balance: 999,
      freeDebatesRemaining: 999,
      hasUsedClaudeBonus: false,
      allowedModels: ALL_MODELS,
    }
  }

  const bal = await getOrCreateBalance(userId)

  // Lazy monthly reset - conditional to avoid race with concurrent requests
  const now = new Date()
  if (now >= bal.freeDebatesResetAt) {
    await prisma.userDebateBalance.updateMany({
      where: { userId, freeDebatesResetAt: { lte: now } },
      data: {
        freeDebatesUsed: 0,
        freeDebatesResetAt: getNextResetDate(),
      },
    })
    bal.freeDebatesUsed = 0
  }

  const freeRemaining = FREE_MONTHLY_LIMIT - bal.freeDebatesUsed
  const hasPaid = bal.balance > 0
  const tier = hasPaid ? "paid" as const : "free" as const

  let allowedModels: Provider[]
  if (hasPaid) {
    allowedModels = ALL_MODELS
  } else {
    allowedModels = [...FREE_MODELS]
    if (!bal.hasUsedClaudeBonus) {
      allowedModels.push("claude")
    }
  }

  return {
    tier,
    balance: bal.balance,
    freeDebatesRemaining: freeRemaining,
    hasUsedClaudeBonus: bal.hasUsedClaudeBonus,
    allowedModels,
  }
}

export async function deductDebate(
  userId: string,
  models: Provider[],
  threadId?: string
) {
  if (USER_TEST_MODE) {
    return { allowed: true, balance: 999, freeRemaining: 999 }
  }

  const bal = await getOrCreateBalance(userId)

  // Lazy monthly reset - conditional to avoid race with concurrent requests
  const now = new Date()
  if (now >= bal.freeDebatesResetAt) {
    await prisma.userDebateBalance.updateMany({
      where: { userId, freeDebatesResetAt: { lte: now } },
      data: {
        freeDebatesUsed: 0,
        freeDebatesResetAt: getNextResetDate(),
      },
    })
    bal.freeDebatesUsed = 0
  }

  const usesClaude = models.includes("claude")
  const freeRemaining = FREE_MONTHLY_LIMIT - bal.freeDebatesUsed

  // Case 1: Claude bonus (one-time) - atomic check via updateMany WHERE
  if (usesClaude && !bal.hasUsedClaudeBonus && bal.balance === 0) {
    const result = await prisma.userDebateBalance.updateMany({
      where: { userId, hasUsedClaudeBonus: false, balance: 0 },
      data: { hasUsedClaudeBonus: true },
    })
    if (result.count === 0) {
      return { allowed: false, reason: "Claude bonus already used" }
    }
    await prisma.debateTransaction.create({
      data: {
        userId,
        amount: -1,
        type: "DEDUCTION",
        threadId,
        description: "Claude bonus debate (one-time)",
      },
    })
    return { allowed: true, balance: bal.balance, freeRemaining }
  }

  // Case 2: Premium model requires paid balance
  if (usesClaude && bal.balance <= 0) {
    return { allowed: false, reason: "Claude requires purchased debates" }
  }

  // Case 3: Uses only free-tier models and has free debates - atomic via WHERE
  if (!usesClaude && freeRemaining > 0) {
    const result = await prisma.userDebateBalance.updateMany({
      where: { userId, freeDebatesUsed: { lt: FREE_MONTHLY_LIMIT } },
      data: { freeDebatesUsed: { increment: 1 } },
    })
    if (result.count === 0) {
      return { allowed: false, reason: "No free debates remaining" }
    }
    await prisma.debateTransaction.create({
      data: {
        userId,
        amount: -1,
        type: "DEDUCTION",
        threadId,
        description: `Free debate (${freeRemaining - 1} remaining)`,
      },
    })
    return { allowed: true, balance: bal.balance, freeRemaining: freeRemaining - 1 }
  }

  // Case 4: Deduct from paid balance - atomic via WHERE balance > 0
  if (bal.balance > 0) {
    const result = await prisma.userDebateBalance.updateMany({
      where: { userId, balance: { gt: 0 } },
      data: { balance: { decrement: 1 } },
    })
    if (result.count === 0) {
      return { allowed: false, reason: "No debates remaining" }
    }
    await prisma.debateTransaction.create({
      data: {
        userId,
        amount: -1,
        type: "DEDUCTION",
        threadId,
        description: `Paid debate (${bal.balance - 1} remaining)`,
      },
    })
    return { allowed: true, balance: bal.balance - 1, freeRemaining: Math.max(0, freeRemaining) }
  }

  // Case 5: Nothing left
  return { allowed: false, reason: "No debates remaining" }
}

function getNextResetDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}
