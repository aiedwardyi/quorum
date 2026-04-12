import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBalanceInfo } from "@/lib/debates"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const info = await getBalanceInfo(session.user.id)
  return NextResponse.json(info)
}
