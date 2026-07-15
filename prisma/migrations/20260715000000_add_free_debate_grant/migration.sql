-- AlterTable
ALTER TABLE "User" ADD COLUMN "freeDebatesRemaining" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "freeDebateExpiresAt" TIMESTAMP(3);
