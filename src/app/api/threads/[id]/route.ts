import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function verifyOwnership(threadId: string, userId: string) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { userId: true },
  })
  return thread?.userId === userId
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!(await verifyOwnership(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { orderIndex: "asc" } },
      verdicts: { orderBy: { createdAt: "asc" } },
    },
  })

  return NextResponse.json(thread)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!(await verifyOwnership(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const { status, title, expectedVersion } = body

  const data = {
    ...(status ? { status } : {}),
    ...(title ? { title: String(title).slice(0, 80) } : {}),
    version: { increment: 1 },
  }

  if (typeof expectedVersion === "number") {
    const result = await prisma.thread.updateMany({
      where: { id, version: expectedVersion },
      data,
    })
    if (result.count === 0) {
      return NextResponse.json(
        { error: "Thread was updated in another tab. Reload to see latest." },
        { status: 409 }
      )
    }
    const thread = await prisma.thread.findUnique({ where: { id } })
    return NextResponse.json(thread)
  }

  const thread = await prisma.thread.update({
    where: { id },
    data,
  })

  return NextResponse.json(thread)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!(await verifyOwnership(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.thread.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
