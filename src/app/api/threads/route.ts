import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get("cursor")
  const search = searchParams.get("q")
  const take = 20

  const threads = await prisma.thread.findMany({
    where: {
      userId: session.user.id,
      ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      models: true,
      status: true,
      updatedAt: true,
      verdicts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          recommendation: true,
          confidence: true,
        },
      },
    },
  })

  const hasMore = threads.length > take
  const items = hasMore ? threads.slice(0, take) : threads
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({ threads: items, nextCursor })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { title, models, rounds, responseLength, locale } = body

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 })
  }
  if (!Array.isArray(models) || models.length === 0) {
    return NextResponse.json({ error: "models must be a non-empty array" }, { status: 400 })
  }
  if (typeof rounds !== "number" || rounds < 1) {
    return NextResponse.json({ error: "rounds must be a positive number" }, { status: 400 })
  }
  if (!responseLength || typeof responseLength !== "string") {
    return NextResponse.json({ error: "responseLength is required" }, { status: 400 })
  }

  const thread = await prisma.thread.create({
    data: {
      title: String(title).slice(0, 80),
      userId: session.user.id,
      models,
      rounds,
      responseLength,
      locale: locale || "en",
    },
  })

  return NextResponse.json(thread, { status: 201 })
}
