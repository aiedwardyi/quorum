-- CreateEnum
CREATE TYPE "DebateTransactionType" AS ENUM ('PURCHASE', 'DEDUCTION', 'SIGNUP_BONUS', 'FREE_RESET');

-- CreateTable
CREATE TABLE "UserDebateBalance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "freeDebatesUsed" INTEGER NOT NULL DEFAULT 0,
    "freeDebatesResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasUsedClaudeBonus" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDebateBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebateTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "DebateTransactionType" NOT NULL,
    "stripeSessionId" TEXT,
    "threadId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebateTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebatePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "debateCount" INTEGER NOT NULL,
    "priceKRW" INTEGER NOT NULL,
    "priceUSD" INTEGER NOT NULL,
    "stripePriceId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebatePackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDebateBalance_userId_key" ON "UserDebateBalance"("userId");

-- CreateIndex
CREATE INDEX "DebateTransaction_userId_createdAt_idx" ON "DebateTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DebateTransaction_stripeSessionId_idx" ON "DebateTransaction"("stripeSessionId");

-- AddForeignKey
ALTER TABLE "UserDebateBalance" ADD CONSTRAINT "UserDebateBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebateTransaction" ADD CONSTRAINT "DebateTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
