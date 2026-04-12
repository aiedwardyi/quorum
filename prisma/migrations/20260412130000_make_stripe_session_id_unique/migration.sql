-- DropIndex
DROP INDEX "DebateTransaction_stripeSessionId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "DebateTransaction_stripeSessionId_key" ON "DebateTransaction"("stripeSessionId");
