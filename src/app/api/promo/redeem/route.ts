import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrCreateBalance } from "@/lib/debates"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { code } = await req.json()
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Code required" }, { status: 400 })
  }

  const promo = await prisma.promoCode.findUnique({
    where: { code: code.trim().toUpperCase() },
  })

  if (!promo || !promo.active) {
    return NextResponse.json({ error: "Invalid code" }, { status: 404 })
  }

  if (promo.expiresAt && new Date() > promo.expiresAt) {
    return NextResponse.json({ error: "Code expired" }, { status: 410 })
  }

  if (promo.usedCount >= promo.maxUses) {
    return NextResponse.json({ error: "Code fully redeemed" }, { status: 410 })
  }

  // Ensure balance row exists
  await getOrCreateBalance(session.user.id)

  // Create redemption record first - unique constraint prevents double-use
  try {
    await prisma.promoRedemption.create({
      data: {
        userId: session.user.id,
        promoCodeId: promo.id,
      },
    })
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Already redeemed" }, { status: 409 })
    }
    throw err
  }

  // Atomically increment usedCount only if under maxUses
  const updated = await prisma.promoCode.updateMany({
    where: { id: promo.id, usedCount: { lt: promo.maxUses } },
    data: { usedCount: { increment: 1 } },
  })

  if (updated.count === 0) {
    // Rollback: delete the redemption since code is fully used
    await prisma.promoRedemption.delete({
      where: { userId_promoCodeId: { userId: session.user.id, promoCodeId: promo.id } },
    })
    return NextResponse.json({ error: "Code fully redeemed" }, { status: 410 })
  }

  await prisma.userDebateBalance.update({
    where: { userId: session.user.id },
    data: { balance: { increment: promo.debateCount } },
  })

  await prisma.debateTransaction.create({
    data: {
      userId: session.user.id,
      amount: promo.debateCount,
      type: "PROMO_REDEMPTION",
      description: `Redeemed code ${promo.code} (+${promo.debateCount} debates)`,
    },
  })

  return NextResponse.json({
    success: true,
    debatesAdded: promo.debateCount,
  })
}
