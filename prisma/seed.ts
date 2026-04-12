import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local" })

const adapter = new PrismaPg(process.env.DATABASE_URL!)
const prisma = new PrismaClient({ adapter })

async function main() {
  const packages = [
    {
      name: "30 Debates",
      debateCount: 30,
      priceKRW: 9900,
      priceUSD: 700,
      stripePriceId: "price_30_placeholder",
    },
    {
      name: "100 Debates",
      debateCount: 100,
      priceKRW: 24900,
      priceUSD: 1800,
      stripePriceId: "price_100_placeholder",
    },
    {
      name: "300 Debates",
      debateCount: 300,
      priceKRW: 59900,
      priceUSD: 4400,
      stripePriceId: "price_300_placeholder",
    },
  ]

  for (const pkg of packages) {
    await prisma.debatePackage.upsert({
      where: { id: pkg.name.toLowerCase().replace(/\s/g, "-") },
      update: pkg,
      create: { id: pkg.name.toLowerCase().replace(/\s/g, "-"), ...pkg },
    })
  }

  console.log("Seeded debate packages")

  // Seed alpha promo codes
  const promoCodes = [
    { code: "QUORUM-ALPHA", debateCount: 50, maxUses: 100 },
    { code: "QUORUM-VIP", debateCount: 100, maxUses: 20 },
    { code: "QUORUM-FRIEND", debateCount: 30, maxUses: 50 },
  ]

  for (const promo of promoCodes) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      update: { debateCount: promo.debateCount, maxUses: promo.maxUses },
      create: promo,
    })
  }

  console.log("Seeded promo codes")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
