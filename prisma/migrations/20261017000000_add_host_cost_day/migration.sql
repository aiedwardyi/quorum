-- CreateTable
CREATE TABLE "HostCostDay" (
    "day" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "cents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostCostDay_pkey" PRIMARY KEY ("day","provider")
);

