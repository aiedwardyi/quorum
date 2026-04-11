/**
 * Drain registry - small pub/sub shim between the smoothed streaming UI
 * hook (producer) and the debate engine (consumer).
 *
 * Why this exists: the engine used to start the next AI as soon as the
 * previous AI's network stream ended, but smoothed display at ~220 cps
 * needed extra time to finish rendering what had been buffered. That
 * forced ChatThread to snap the previous bubble to its full content
 * when the next bubble took over, dumping 70-90% of non-Claude content
 * in one frame.
 *
 * The engine now awaits waitForDrain(messageId) after each callModel.
 * useSmoothStream calls reportDrained(messageId) once displayed catches
 * up to target and the network stream is closed, which resolves the
 * waiter and lets the engine start the next model.
 *
 * The waiter always resolves, even if the reporter never fires, thanks
 * to a per-call timeout. That keeps a stuck bubble (cancelled request,
 * unmount, etc.) from hanging the entire debate.
 */

interface PendingEntry {
  promise: Promise<void>
  resolve: () => void
}
const pending = new Map<string, PendingEntry>()
// Track ids that have reported drained before anyone was waiting. When
// waitForDrain is called later for one of these, it resolves instantly
// instead of sitting through the timeout. Bounded at 64 entries so a
// long conversation never leaks memory.
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
  // If a waiter already exists for this id, return the same promise
  // instead of overwriting the map entry. The previous implementation
  // would replace the first resolver, leaving the original promise
  // hanging until its setTimeout fired. In practice this only happens
  // on hot-reload or double-call edge cases, but either way a single
  // report should resolve every outstanding waiter.
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
