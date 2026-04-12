import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const packages = await prisma.debatePackage.findMany({
    where: { active: true },
    orderBy: { debateCount: "asc" },
    select: {
      id: true,
      name: true,
      debateCount: true,
      priceKRW: true,
      priceUSD: true,
    },
  })
  return NextResponse.json(packages)
}
