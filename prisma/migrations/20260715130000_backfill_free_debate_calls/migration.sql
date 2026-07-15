-- Backfill call budget for free windows opened before freeDebateCallsRemaining existed.
UPDATE "User"
SET "freeDebateCallsRemaining" = 36
WHERE "freeDebateExpiresAt" IS NOT NULL
  AND "freeDebateExpiresAt" > CURRENT_TIMESTAMP
  AND "freeDebateCallsRemaining" = 0;
