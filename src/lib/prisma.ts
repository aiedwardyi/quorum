import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    // Return a proxy that throws on access - allows build to succeed
    // but will fail at runtime if DATABASE_URL is not configured
    return new Proxy({} as PrismaClient, {
      get(_, prop) {
        if (prop === "then") return undefined
        throw new Error("DATABASE_URL is not configured")
      },
    })
  }
  const adapter = new PrismaPg(process.env.DATABASE_URL)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
