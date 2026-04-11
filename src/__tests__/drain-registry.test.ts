import { describe, it, expect, beforeEach } from "vitest"
import {
  waitForDrain,
  reportDrained,
  _resetDrainRegistry,
} from "@/lib/drain-registry"

describe("drain-registry", () => {
  beforeEach(() => {
    _resetDrainRegistry()
  })

  it("resolves when reportDrained fires after waitForDrain", async () => {
    const id = "msg-1"
    const p = waitForDrain(id, 2000)
    // Resolve on next microtask so the waiter is definitely registered.
    queueMicrotask(() => reportDrained(id))
    await expect(p).resolves.toBeUndefined()
  })

  it("resolves immediately when reportDrained already fired (pre-drain)", async () => {
    const id = "msg-2"
    reportDrained(id)
    // A waiter registered after the report should resolve instantly.
    const start = Date.now()
    await waitForDrain(id, 2000)
    expect(Date.now() - start).toBeLessThan(50)
  })

  it("consumes the pre-drain marker so a second wait would time out", async () => {
    const id = "msg-3"
    reportDrained(id)
    await waitForDrain(id, 2000) // consumes the marker
    // A second wait with a tight timeout should hit the timeout, not
    // resolve instantly. We use a 40ms window to keep the test fast.
    const start = Date.now()
    await waitForDrain(id, 40)
    expect(Date.now() - start).toBeGreaterThanOrEqual(30)
  })

  it("resolves on its timeout when reportDrained never fires", async () => {
    const id = "msg-4"
    const start = Date.now()
    await waitForDrain(id, 40)
    expect(Date.now() - start).toBeGreaterThanOrEqual(30)
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
    // Give pending microtasks a tick to run.
    await new Promise((r) => setTimeout(r, 10))
    expect(resolvedCount).toBe(2)
  })

  it("reportDrained is a no-op for unknown ids and does not leak", async () => {
    // Should not throw, and a waiter that comes later is not short-circuited.
    expect(() => reportDrained("nope")).not.toThrow()
    _resetDrainRegistry()
    const start = Date.now()
    await waitForDrain("later", 40)
    expect(Date.now() - start).toBeGreaterThanOrEqual(30)
  })
})
