import { describe, it, expect } from "vitest"
import {
  computeNextDisplayedLength,
  getPacingForProvider,
  BASE_CPS,
  MAX_CPS,
  RAMP_THRESHOLD,
  TURBO_CPS,
  DEFAULT_PACING,
  PROVIDER_PACING,
  type PacingConfig,
} from "@/lib/smooth-stream"

describe("computeNextDisplayedLength", () => {
  it("returns displayed unchanged when nothing is pending", () => {
    const result = computeNextDisplayedLength({ displayed: 50, target: 50, dtMs: 16 })
    expect(result).toBe(50)
  })

  it("snaps to target when target is shorter than displayed (truncation)", () => {
    const result = computeNextDisplayedLength({ displayed: 200, target: 80, dtMs: 16 })
    expect(result).toBe(80)
  })

  it("advances at base rate when pending is small", () => {
    // 16ms tick, BASE_CPS = 55. Expected ~ round(55 * 16 / 1000) = 1
    const result = computeNextDisplayedLength({ displayed: 0, target: 10, dtMs: 16 })
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(2)
  })

  it("advances at least one char per tick even with tiny dtMs", () => {
    const result = computeNextDisplayedLength({ displayed: 0, target: 10, dtMs: 1 })
    expect(result).toBe(1)
  })

  it("never overshoots the target", () => {
    const result = computeNextDisplayedLength({ displayed: 8, target: 10, dtMs: 1000 })
    expect(result).toBe(10)
  })

  it("accelerates as pending grows past the ramp threshold", () => {
    // Same dtMs, much larger pending should advance more chars
    const small = computeNextDisplayedLength({ displayed: 0, target: 10, dtMs: 32 })
    const huge = computeNextDisplayedLength({ displayed: 0, target: 5000, dtMs: 32 })
    expect(huge).toBeGreaterThan(small)
  })

  it("caps the rate at MAX_CPS even with very large pending", () => {
    // 16ms tick at MAX_CPS = 180 default, round(180 * 16 / 1000) = 3
    // With 10000 pending chars, should still cap around MAX_CPS * dt / 1000
    const result = computeNextDisplayedLength({ displayed: 0, target: 10000, dtMs: 16 })
    const maxExpected = Math.ceil((MAX_CPS * 16) / 1000) + 1 // small fudge
    expect(result).toBeLessThanOrEqual(maxExpected)
  })

  it("clamps dtMs to a reasonable upper bound (no huge jumps after tab unfocus)", () => {
    // 5 seconds of dt should NOT dump 5*MAX chars instantly.
    // Implementation should clamp dtMs to ~100ms internally.
    const result = computeNextDisplayedLength({ displayed: 0, target: 10000, dtMs: 5000 })
    const cap = Math.ceil((MAX_CPS * 100) / 1000) + 1
    expect(result).toBeLessThanOrEqual(cap)
  })

  it("exposes sensible default constants", () => {
    expect(BASE_CPS).toBeGreaterThan(0)
    expect(MAX_CPS).toBeGreaterThan(BASE_CPS)
    expect(RAMP_THRESHOLD).toBeGreaterThan(0)
    expect(TURBO_CPS).toBeGreaterThan(MAX_CPS)
  })

  describe("turbo mode", () => {
    it("drains faster than non-turbo for the same buffer", () => {
      // Use an explicit high-turbo pacing so this test is independent of
      // the default TURBO_CPS tuning.
      const pacing: PacingConfig = { baseCps: 55, maxCps: 180, rampThreshold: 150, turboCps: 1200 }
      const normal = computeNextDisplayedLength({ displayed: 0, target: 1000, dtMs: 16, pacing })
      const turbo = computeNextDisplayedLength({
        displayed: 0,
        target: 1000,
        dtMs: 16,
        turbo: true,
        pacing,
      })
      expect(turbo).toBeGreaterThan(normal * 3)
    })

    it("drains a 600-char buffer in a bounded number of ticks at 60fps", () => {
      // At the default turbo cps, the drain should still complete
      // in well under 2 seconds (120 ticks at 60fps).
      let displayed = 0
      const target = 600
      let ticks = 0
      while (displayed < target && ticks < 200) {
        displayed = computeNextDisplayedLength({ displayed, target, dtMs: 16, turbo: true })
        ticks++
      }
      expect(displayed).toBe(target)
      expect(ticks).toBeLessThan(120)
    })

    it("never overshoots the target in turbo", () => {
      const result = computeNextDisplayedLength({
        displayed: 990,
        target: 1000,
        dtMs: 100,
        turbo: true,
      })
      expect(result).toBe(1000)
    })

    it("snaps on truncation regardless of turbo", () => {
      const result = computeNextDisplayedLength({
        displayed: 500,
        target: 100,
        dtMs: 16,
        turbo: true,
      })
      expect(result).toBe(100)
    })

    it("still clamps dtMs under turbo (no huge jumps after tab unfocus)", () => {
      const result = computeNextDisplayedLength({
        displayed: 0,
        target: 100000,
        dtMs: 10000,
        turbo: true,
      })
      const cap = Math.ceil((TURBO_CPS * 100) / 1000) + 1
      expect(result).toBeLessThanOrEqual(cap)
    })
  })

  describe("per-provider pacing", () => {
    it("getPacingForProvider returns DEFAULT_PACING when provider is missing", () => {
      expect(getPacingForProvider()).toBe(DEFAULT_PACING)
      expect(getPacingForProvider(null)).toBe(DEFAULT_PACING)
      expect(getPacingForProvider("unknown")).toBe(DEFAULT_PACING)
    })

    it("getPacingForProvider returns the provider-specific config when known", () => {
      expect(getPacingForProvider("claude")).toBe(PROVIDER_PACING.claude)
      expect(getPacingForProvider("gemini")).toBe(PROVIDER_PACING.gemini)
      expect(getPacingForProvider("perplexity")).toBe(PROVIDER_PACING.perplexity)
      expect(getPacingForProvider("gpt")).toBe(PROVIDER_PACING.gpt)
    })

    it("Gemini and Perplexity share the same ramp shape", () => {
      // Gemini and Perplexity stream with similar burst patterns at the
      // network layer, so they share one pacing config. Claude and GPT
      // each get their own tuned to their specific backend shape.
      const { gemini, perplexity } = PROVIDER_PACING
      expect(gemini.baseCps).toBe(perplexity.baseCps)
      expect(gemini.maxCps).toBe(perplexity.maxCps)
      expect(gemini.rampThreshold).toBe(perplexity.rampThreshold)
      expect(gemini.turboCps).toBe(perplexity.turboCps)
    })

    it("Claude has a higher floor and earlier ramp than the shared config", () => {
      // Claude streams steadily at a low effective rate - pending
      // rarely grows past a handful of characters so the ramp never
      // triggers with a shared config and it reads noticeably slower
      // than Gemini/Perplexity. Lifting its baseCps and dropping its
      // rampThreshold means even small bursts push the rate up, and
      // the steady stream no longer feels chuggy next to the others.
      const { claude, gemini } = PROVIDER_PACING
      expect(claude.baseCps).toBeGreaterThan(gemini.baseCps)
      expect(claude.rampThreshold).toBeLessThan(gemini.rampThreshold)
    })

    it("GPT uses a slower config to match the others' perceptual speed", () => {
      // GPT's backend emits tokens in even larger bursts than
      // Gemini/Perplexity, so its ramp ratio pegs at 1.0 almost
      // continuously. If GPT shared the same max cap it would sit at
      // peak speed almost the whole stream while the others hover
      // well below their ceiling, and the perceptual mismatch would
      // read as "GPT types way faster." Capping GPT's max below the
      // shared cap and raising its ramp threshold brings its
      // sustained on-screen rate down into line. Test asserts
      // relationships, not specific values, so retunes don't break it.
      const { gemini, gpt } = PROVIDER_PACING
      expect(gpt.maxCps).toBeLessThan(gemini.maxCps)
      expect(gpt.rampThreshold).toBeGreaterThan(gemini.rampThreshold)
      expect(gpt.turboCps).toBeLessThan(gemini.turboCps)
    })

    it("saturated GPT tick advances fewer chars than saturated Claude tick", () => {
      const claudeAdvance = computeNextDisplayedLength({
        displayed: 0,
        target: 10000,
        dtMs: 100,
        pacing: PROVIDER_PACING.claude,
      })
      const gptAdvance = computeNextDisplayedLength({
        displayed: 0,
        target: 10000,
        dtMs: 100,
        pacing: PROVIDER_PACING.gpt,
      })
      expect(gptAdvance).toBeLessThan(claudeAdvance)
    })

    it("all providers still honor truncation and minimum advance", () => {
      for (const pacing of Object.values(PROVIDER_PACING)) {
        expect(computeNextDisplayedLength({ displayed: 500, target: 100, dtMs: 16, pacing })).toBe(
          100
        )
        expect(computeNextDisplayedLength({ displayed: 0, target: 10, dtMs: 1, pacing })).toBe(1)
      }
    })
  })
})
