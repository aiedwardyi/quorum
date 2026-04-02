import { PrismaClient } from "@prisma/client"

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
  return new PrismaClient()
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
