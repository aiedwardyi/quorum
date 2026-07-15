/** GET free-debate grant status for the signed-in user. */
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { authEnabled } from "@/lib/deploy-config"
import { getFreeDebateStatus } from "@/lib/free-debates"

export async function GET() {
  if (!authEnabled()) {
    return NextResponse.json({ remaining: 0, active: false, expiresAt: null })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const status = await getFreeDebateStatus(session.user.id)
    return NextResponse.json(status)
  } catch (error) {
    console.error("[free-debate] status failed:", error)
    return NextResponse.json({ error: "status_failed" }, { status: 500 })
  }
}
