/**
 * Pure pacing math for the smoothed chat streaming UI.
 *
 * The chat engine accumulates raw provider chunks into "target" text.
 * This function computes how many characters of the target should be
 * visible after one render tick, using a buffer-aware adaptive rate.
 *
 * No DOM, no React, no timing source - fully deterministic so it can
 * be unit-tested with vitest.
 */

// Default pacing. These are the legacy single-pace constants, kept exported
// for backwards compatibility with existing call sites and tests.
export const BASE_CPS = 55
export const MAX_CPS = 180
export const RAMP_THRESHOLD = 150
// Turbo rate applied once the network stream has ended and any remaining
// buffer just needs to drain before the next model takes over. Visibly
// typing rather than a hard snap that looks like dumping a paragraph.
export const TURBO_CPS = 450
const MAX_DT_MS = 100

/** Per-provider pacing config. MAX caps the steady-state typing rate during
 *  the live stream (a provider whose network stream exceeds this builds a
 *  buffer that drains at TURBO once the stream ends). TURBO governs the
 *  post-stream drain rate. */
export interface PacingConfig {
  baseCps: number
  maxCps: number
  rampThreshold: number
  turboCps: number
}

export const DEFAULT_PACING: PacingConfig = {
  baseCps: BASE_CPS,
  maxCps: MAX_CPS,
  rampThreshold: RAMP_THRESHOLD,
  turboCps: TURBO_CPS,
}

/**
 * Per-provider pacing. Three distinct configs tuned to each backend's
 * streaming shape so a round-robin debate reads with one consistent
 * on-screen cadence even though the providers deliver tokens very
 * differently at the network layer.
 *
 * Claude streams smoothly and steadily at a relatively low effective
 * rate - pending rarely grows past a handful of characters so the
 * ramp (which kicks in above `rampThreshold` pending) almost never
 * triggers. With a shared config Claude ends up reading noticeably
 * slower than the others; we lift its baseCps and drop its
 * rampThreshold so even small bursts lift the on-screen rate toward
 * the shared max, and the steady stream never feels chuggy.
 *
 * Gemini and Perplexity send larger bursts at the network layer and
 * fill the smooth-stream buffer quickly, then close the stream while
 * the buffer is still draining. The tail drain at turbo is the "fast
 * near the end" window users notice; lowering turboCps slows that
 * window down without affecting the main stream.
 *
 * GPT emits tokens in even larger bursts than Gemini/Perplexity, so
 * its ramp ratio pegs at 1.0 almost continuously. It needs the
 * lowest max cap of the four to keep from running visibly faster
 * than everyone else during the main stream, plus a higher ramp
 * threshold so small early-stream bursts don't prematurely slam the
 * rate up.
 *
 * Keep this docblock free of exact cps numbers - the numeric values
 * below have shifted several times and inline numbers in the prose
 * drift out of sync. Read the configs directly for current values.
 */
const CLAUDE_PACING: PacingConfig = {
  baseCps: 95,
  maxCps: 300,
  rampThreshold: 80,
  turboCps: 370,
}

const GEMINI_PERPLEXITY_PACING: PacingConfig = {
  baseCps: 75,
  maxCps: 300,
  rampThreshold: 140,
  turboCps: 280,
}

const GPT_PACING: PacingConfig = {
  baseCps: 75,
  maxCps: 240,
  rampThreshold: 190,
  turboCps: 250,
}

export const PROVIDER_PACING: Record<string, PacingConfig> = {
  claude: CLAUDE_PACING,
  gemini: GEMINI_PERPLEXITY_PACING,
  perplexity: GEMINI_PERPLEXITY_PACING,
  gpt: GPT_PACING,
}

export function getPacingForProvider(provider?: string | null): PacingConfig {
  if (!provider) return DEFAULT_PACING
  return PROVIDER_PACING[provider] ?? DEFAULT_PACING
}

export interface SmoothStreamTickInput {
  displayed: number
  target: number
  dtMs: number
  /** True once the network stream has ended and the hook is just draining.
   *  When set, the tick uses the config's turboCps instead of the ramp. */
  turbo?: boolean
  /** Optional pacing config. Defaults to DEFAULT_PACING. */
  pacing?: PacingConfig
}

export function computeNextDisplayedLength({
  displayed,
  target,
  dtMs,
  turbo,
  pacing = DEFAULT_PACING,
}: SmoothStreamTickInput): number {
  // Truncation: engine shrunk the target (Stop button, short-mode clamp).
  // Snap immediately so we never show stale/ghost text.
  if (target < displayed) return target

  const pending = target - displayed
  if (pending <= 0) return displayed

  // Clamp dt so a backgrounded tab returning after a long pause
  // doesn't dump the entire buffer in one frame.
  const clampedDt = Math.min(dtMs, MAX_DT_MS)

  let cps: number
  if (turbo) {
    cps = pacing.turboCps
  } else {
    // Linear ramp from baseCps at pending=0 to maxCps at pending>=rampThreshold.
    const rampRatio = Math.min(1, pending / pacing.rampThreshold)
    cps = pacing.baseCps + rampRatio * (pacing.maxCps - pacing.baseCps)
  }

  // Always advance at least one char per tick when there is pending content.
  const charsToAdd = Math.max(1, Math.round((cps * clampedDt) / 1000))
  const next = displayed + charsToAdd
  return next > target ? target : next
}
