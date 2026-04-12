import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStripe } from "@/lib/stripe"

export const dynamic = "force-dynamic"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { packageId } = await req.json()
  if (!packageId) {
    return NextResponse.json({ error: "packageId required" }, { status: 400 })
  }

  const pkg = await prisma.debatePackage.findFirst({
    where: { id: packageId, active: true },
  })
  if (!pkg) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 })
  }

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000")

  const checkoutSession = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price: pkg.stripePriceId,
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.user.id,
      packageId: pkg.id,
      debateCount: String(pkg.debateCount),
    },
    customer_email: session.user.email,
    success_url: `${baseUrl}/?purchase=success`,
    cancel_url: `${baseUrl}/?purchase=cancelled`,
  })

  return NextResponse.json({ url: checkoutSession.url })
}
