/**
 * Pub/sub shim between useSmoothStream (producer) and the debate engine:
 * the engine awaits waitForDrain(id) so the next model doesn't start while
 * the previous bubble is still draining (which used to snap 70-90% of a
 * response in one frame). reportDrained resolves the waiter; a per-call
 * timeout guarantees resolution if the reporter never fires.
 */

interface PendingEntry {
  promise: Promise<void>
  resolve: () => void
}
const pending = new Map<string, PendingEntry>()
// Ids that drained before anyone waited resolve instantly instead of timing out. Bounded at 64 entries.
const preDrained = new Set<string>()
const PRE_DRAINED_CAP = 64

/** Default safety timeout. Long enough to drain a long-mode Claude
 *  response (worst case a few seconds of turbo drain) but short enough
 *  that a genuinely stuck bubble doesn't block the debate forever. */
export const DEFAULT_DRAIN_TIMEOUT_MS = 8000

/**
 * Wait for a bubble to report drained, or for the timeout to elapse.
 * Resolves regardless so the caller never hangs.
 */
export function waitForDrain(
  messageId: string,
  timeoutMs: number = DEFAULT_DRAIN_TIMEOUT_MS
): Promise<void> {
  // Already drained before we registered - resolve immediately.
  if (preDrained.has(messageId)) {
    preDrained.delete(messageId)
    return Promise.resolve()
  }
  // Return the existing promise: overwriting the entry would leave the first caller hung until its timeout.
  const existing = pending.get(messageId)
  if (existing) return existing.promise

  let resolveFn: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve
  })
  const finish = () => {
    pending.delete(messageId)
    resolveFn()
  }
  const timer = setTimeout(finish, timeoutMs)
  pending.set(messageId, {
    promise,
    resolve: () => {
      clearTimeout(timer)
      finish()
    },
  })
  return promise
}

/**
 * Signal that the bubble with this id has finished smoothing to its
 * full target content. Resolves a pending waiter if there is one,
 * otherwise records the id so a waiter registered later can resolve
 * immediately (covers the race where short bubbles finish before the
 * engine gets a chance to call waitForDrain).
 */
export function reportDrained(messageId: string): void {
  const entry = pending.get(messageId)
  if (entry) {
    entry.resolve()
    return
  }
  preDrained.add(messageId)
  if (preDrained.size > PRE_DRAINED_CAP) {
    // Drop oldest to keep the set bounded.
    const iter = preDrained.values().next()
    if (!iter.done) preDrained.delete(iter.value)
  }
}

/** Test/hmr helper - drop any in-flight waiters without resolving them. */
export function _resetDrainRegistry(): void {
  pending.clear()
  preDrained.clear()
}
