import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { deductDebate } from "@/lib/debates"
import type { Provider } from "@/types"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const models: Provider[] = body.models
  const threadId: string | undefined = body.threadId

  if (!models || !Array.isArray(models) || models.length === 0) {
    return NextResponse.json({ error: "models required" }, { status: 400 })
  }

  const result = await deductDebate(session.user.id, models, threadId)

  if (!result.allowed) {
    return NextResponse.json({ allowed: false, reason: result.reason }, { status: 403 })
  }

  return NextResponse.json(result)
}
