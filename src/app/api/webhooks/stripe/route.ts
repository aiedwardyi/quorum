import { NextResponse } from "next/server"
import { getStripe } from "@/lib/stripe"

export const dynamic = "force-dynamic"
import { prisma } from "@/lib/prisma"
import type Stripe from "stripe"

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET not configured")
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 })
  }

  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    )
  } catch (err) {
    console.error("[stripe] Webhook signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session

    const userId = session.metadata?.userId
    const packageId = session.metadata?.packageId
    const debateCount = parseInt(session.metadata?.debateCount || "0", 10)

    if (!userId || !packageId || !debateCount) {
      console.error("[stripe] Missing metadata in checkout session:", session.id)
      return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
    }

    // Create transaction first - unique stripeSessionId prevents double-processing
    try {
      await prisma.debateTransaction.create({
        data: {
          userId,
          amount: debateCount,
          type: "PURCHASE",
          stripeSessionId: session.id,
          description: `Purchased ${debateCount} debates (${packageId})`,
        },
      })
    } catch (err: unknown) {
      // P2002 = unique constraint violation = already processed
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2002") {
        return NextResponse.json({ received: true, duplicate: true })
      }
      throw err
    }

    // Transaction created successfully - safe to credit balance
    await prisma.userDebateBalance.upsert({
      where: { userId },
      update: { balance: { increment: debateCount } },
      create: {
        userId,
        balance: debateCount,
        freeDebatesResetAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      },
    })

    console.log(`[stripe] Credited ${debateCount} debates to user ${userId}`)
  }

  return NextResponse.json({ received: true })
}
