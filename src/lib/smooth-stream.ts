/** Pure pacing math for smoothed chat streaming - deterministic, no DOM or
 *  timing source, so it unit-tests cleanly. */

// Default pacing. These are the legacy single-pace constants, kept exported
// for backwards compatibility with existing call sites and tests.
export const BASE_CPS = 55
export const MAX_CPS = 180
export const RAMP_THRESHOLD = 150
// Post-stream drain rate: visibly typing instead of dumping the buffer.
export const TURBO_CPS = 450
const MAX_DT_MS = 100

/** Per-provider pacing config. MAX caps steady-state rate during live stream;
 *  buffer drains at TURBO post-stream. */
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
 * Per-provider pacing tuned to each backend's burst shape so the debate reads
 * at one cadence. Claude streams steady and slow: higher base + lower ramp
 * threshold keep it from feeling chuggy. Gemini/Perplexity burst then drain
 * after close: lower turbo tames the fast tail. GPT bursts hardest: lowest
 * max cap + higher ramp threshold. No cps numbers in prose - they drift;
 * read the configs.
 */
const CLAUDE_PACING: PacingConfig = {
  baseCps: 145,
  maxCps: 400,
  rampThreshold: 65,
  turboCps: 500,
}

const GEMINI_PERPLEXITY_PACING: PacingConfig = {
  baseCps: 90,
  maxCps: 360,
  rampThreshold: 130,
  turboCps: 335,
}

const GPT_PACING: PacingConfig = {
  baseCps: 90,
  maxCps: 290,
  rampThreshold: 185,
  turboCps: 300,
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
