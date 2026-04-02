import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const thread = await prisma.thread.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (thread?.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const { recommendation, voteSplit, confidence, reasons, minorityView, oppositeCase, afterMessageIndex, expectedVersion } = body

  try {
    const verdict = await prisma.$transaction(async (tx) => {
      const created = await tx.verdict.create({
        data: {
          threadId: id,
          recommendation,
          voteSplit,
          confidence,
          reasons,
          minorityView,
          oppositeCase,
          afterMessageIndex: afterMessageIndex ?? 0,
        },
      })
      if (typeof expectedVersion === "number") {
        const result = await tx.thread.updateMany({
          where: { id, version: expectedVersion },
          data: { status: "complete", version: { increment: 1 } },
        })
        if (result.count === 0) throw new Error("VERSION_CONFLICT")
      } else {
        await tx.thread.update({
          where: { id },
          data: { status: "complete", version: { increment: 1 } },
        })
      }
      return created
    })
    return NextResponse.json(verdict, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === "VERSION_CONFLICT") {
      return NextResponse.json(
        { error: "Thread was updated in another tab. Reload to see latest." },
        { status: 409 }
      )
    }
    throw err
  }
}
