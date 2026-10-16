import { describe, it, expect } from "vitest"
import { shouldSendOnKey } from "@/lib/send-key"

const press = (over: Partial<Parameters<typeof shouldSendOnKey>[0]> = {}) =>
  shouldSendOnKey({ key: "Enter", shiftKey: false, isComposing: false, ...over })

describe("shouldSendOnKey", () => {
  it("sends on plain Enter", () => {
    expect(press()).toBe(true)
  })

  it("does not send on Shift+Enter", () => {
    expect(press({ shiftKey: true })).toBe(false)
  })

  it("does not send while an IME is composing", () => {
    expect(press({ isComposing: true })).toBe(false)
  })

  it("ignores other keys", () => {
    expect(press({ key: "a" })).toBe(false)
  })
})
