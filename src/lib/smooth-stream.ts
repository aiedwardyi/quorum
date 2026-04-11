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
 * Per-provider pacing. Claude, Gemini, and Perplexity share the Claude
 * ramp shape (55 -> 220 cps ramp at pending >= 150 chars, 280 cps turbo
 * drain). Turbo used to sit at 600 cps, but at 60fps that's ~10 chars
 * per frame, which reads as visibly chunky "finishing" on every bubble.
 * Drain-aware handoff already waits for the bubble to type through, so
 * we don't need turbo to be that aggressive.
 *
 * GPT gets its own slower config. Its backend emits tokens in much
 * larger bursts than the others, which fills the smooth-stream buffer
 * faster and pushes the ramp ratio to 1.0 far more often than Claude
 * or Gemini. With the shared 220 max GPT sat at peak speed almost the
 * whole stream, while Claude/Gemini hovered nearer 120-150 cps, and
 * the perceptual mismatch read as "GPT types way faster than the
 * others." Capping GPT's max at 180 and raising its ramp threshold to
 * 200 brings its sustained rate into alignment with the rest.
 */
const CLAUDE_LIKE_PACING: PacingConfig = {
  baseCps: 75,
  maxCps: 300,
  rampThreshold: 140,
  turboCps: 370,
}

const GPT_PACING: PacingConfig = {
  baseCps: 75,
  maxCps: 240,
  rampThreshold: 190,
  turboCps: 330,
}

export const PROVIDER_PACING: Record<string, PacingConfig> = {
  claude: CLAUDE_LIKE_PACING,
  gemini: CLAUDE_LIKE_PACING,
  perplexity: CLAUDE_LIKE_PACING,
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
