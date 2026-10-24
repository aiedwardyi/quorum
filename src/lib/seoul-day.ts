/** YYYY-MM-DD day key that resets at 00:00 Seoul (15:00 UTC); Seoul has no DST, so +9 h is exact. */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000

// Browser-safe: visit-beacon imports this, so never import prisma here.
export function seoulDay(now = new Date()): string {
  return new Date(now.getTime() + SEOUL_OFFSET_MS).toISOString().slice(0, 10)
}
