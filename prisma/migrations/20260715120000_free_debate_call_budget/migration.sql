-- AlterTable
ALTER TABLE "User" ADD COLUMN "freeDebateCallsRemaining" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "HostSpendDay" (
    "day" TEXT NOT NULL,
    "centsUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostSpendDay_pkey" PRIMARY KEY ("day")
);
