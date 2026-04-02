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
  const { recommendation, voteSplit, confidence, reasons, minorityView, oppositeCase, afterMessageIndex } = body

  const [verdict] = await prisma.$transaction([
    prisma.verdict.create({
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
    }),
    prisma.thread.update({
      where: { id },
      data: { status: "complete", version: { increment: 1 } },
    }),
  ])

  return NextResponse.json(verdict, { status: 201 })
}
