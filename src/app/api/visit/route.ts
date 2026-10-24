/** Anonymous daily visitor count: stores only sha256(day + ":" + browser id). No IP, no cookie. */
import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { hasDatabase } from "@/lib/host-spend"
import { seoulDay } from "@/lib/seoul-day"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function visitHash(day: string, id: string): string {
  return createHash("sha256").update(`${day}:${id.toLowerCase()}`).digest("hex")
}

export async function POST(req: Request) {
  let id: unknown
  try {
    id = ((await req.json()) as { id?: unknown })?.id
  } catch {
    return new Response(null, { status: 400 })
  }
  if (typeof id !== "string" || !UUID.test(id)) return new Response(null, { status: 400 })
  if (!hasDatabase()) return new Response(null, { status: 204 })

  const day = seoulDay()
  try {
    await prisma.dailyVisitor.createMany({
      data: [{ hash: visitHash(day, id), day }],
      skipDuplicates: true,
    })
  } catch (error) {
    console.error("[visit] write failed:", error instanceof Error ? error.message : error)
  }
  return new Response(null, { status: 204 })
}
