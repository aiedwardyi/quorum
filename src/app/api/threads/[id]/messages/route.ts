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
    select: { userId: true, version: true },
  })
  if (thread?.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { messages, expectedVersion } = await req.json()

  if (typeof expectedVersion === "number" && thread.version !== expectedVersion) {
    return NextResponse.json(
      { error: "Thread was updated in another tab. Reload to see latest." },
      { status: 409 }
    )
  }

  await prisma.$transaction([
    prisma.threadMessage.createMany({
      data: messages.map((m: { sender: string; displayName: string; content: string; orderIndex: number }) => ({
        threadId: id,
        sender: m.sender,
        displayName: m.displayName,
        content: m.content,
        orderIndex: m.orderIndex,
      })),
      skipDuplicates: true,
    }),
    prisma.thread.update({
      where: { id },
      data: { version: { increment: 1 } },
    }),
  ])

  return NextResponse.json({ ok: true })
}
