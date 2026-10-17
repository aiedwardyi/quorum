-- CreateTable
CREATE TABLE "DailyVisitor" (
    "hash" TEXT NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "DailyVisitor_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE INDEX "DailyVisitor_day_idx" ON "DailyVisitor"("day");

