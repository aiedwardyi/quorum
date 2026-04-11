import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  waitForDrain,
  reportDrained,
  _resetDrainRegistry,
} from "@/lib/drain-registry"

// Use fake timers throughout so the timeout-related assertions are
// deterministic on slow or contended CI runners. The earlier version
// of these tests measured wall-clock durations with Date.now() and
// small tolerance windows, which is exactly the flaky shape CI hates.
describe("drain-registry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetDrainRegistry()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("resolves when reportDrained fires after waitForDrain", async () => {
    const id = "msg-1"
    const p = waitForDrain(id, 2000)
    // Fire the report on a microtask so the waiter is definitely registered.
    queueMicrotask(() => reportDrained(id))
    await expect(p).resolves.toBeUndefined()
  })

  it("resolves immediately when reportDrained already fired (pre-drain)", async () => {
    const id = "msg-2"
    reportDrained(id)
    // No timer advance required - waitForDrain should already be
    // resolved because the preDrained marker short-circuits it.
    await expect(waitForDrain(id, 2000)).resolves.toBeUndefined()
  })

  it("consumes the pre-drain marker so a second wait still times out", async () => {
    const id = "msg-3"
    reportDrained(id)
    await waitForDrain(id, 2000) // consumes the marker
    // A second wait needs to actually run down its timeout to resolve.
    const second = waitForDrain(id, 40)
    let resolved = false
    second.then(() => {
      resolved = true
    })
    // Microtask checkpoint - the promise is still pending.
    await Promise.resolve()
    expect(resolved).toBe(false)
    // Advance past the timeout and let pending callbacks run.
    await vi.advanceTimersByTimeAsync(40)
    await expect(second).resolves.toBeUndefined()
    expect(resolved).toBe(true)
  })

  it("resolves on its timeout when reportDrained never fires", async () => {
    const id = "msg-4"
    const p = waitForDrain(id, 40)
    await vi.advanceTimersByTimeAsync(40)
    await expect(p).resolves.toBeUndefined()
  })

  it("returns the same promise when waitForDrain is called twice for the same id", async () => {
    const id = "msg-double"
    const p1 = waitForDrain(id, 2000)
    const p2 = waitForDrain(id, 2000)
    // Implementation detail: second call returns the first promise
    // unchanged so a single reportDrained resolves both awaits.
    expect(p2).toBe(p1)
    let resolvedCount = 0
    p1.then(() => {
      resolvedCount++
    })
    p2.then(() => {
      resolvedCount++
    })
    reportDrained(id)
    await p1
    await p2
    // Let pending microtask callbacks run.
    await Promise.resolve()
    expect(resolvedCount).toBe(2)
  })

  it("reportDrained is a no-op for unknown ids and does not leak", async () => {
    // Should not throw, and a waiter registered later is not short-circuited.
    expect(() => reportDrained("nope")).not.toThrow()
    _resetDrainRegistry()
    const p = waitForDrain("later", 40)
    await vi.advanceTimersByTimeAsync(40)
    await expect(p).resolves.toBeUndefined()
  })
})
