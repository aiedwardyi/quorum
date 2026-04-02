import { describe, it, expect } from "vitest"
import {
  buildSaveMessages,
  shouldAutoSave,
} from "@/hooks/useThreadPersistence"
import type { Message } from "@/types"

const makeMsg = (sender: string, content: string, index: number): Message => ({
  id: `${sender}-${index}`,
  sender: sender as Message["sender"],
  displayName: sender,
  content,
  timestamp: new Date(),
})

describe("buildSaveMessages", () => {
  it("maps messages to DB format with orderIndex starting from offset", () => {
    const msgs = [
      makeMsg("user", "hello", 0),
      makeMsg("gemini", "hi there", 1),
    ]
    const result = buildSaveMessages(msgs, 0)
    expect(result).toEqual([
      { sender: "user", displayName: "user", content: "hello", orderIndex: 0 },
      { sender: "gemini", displayName: "gemini", content: "hi there", orderIndex: 1 },
    ])
  })

  it("applies offset for incremental saves", () => {
    const msgs = [makeMsg("claude", "response", 0)]
    const result = buildSaveMessages(msgs, 5)
    expect(result).toEqual([
      { sender: "claude", displayName: "claude", content: "response", orderIndex: 5 },
    ])
  })

  it("returns empty array for empty input", () => {
    expect(buildSaveMessages([], 0)).toEqual([])
  })
})

describe("shouldAutoSave", () => {
  it("returns false when not logged in", () => {
    expect(shouldAutoSave(false, null)).toBe(false)
  })

  it("returns false when no thread id", () => {
    expect(shouldAutoSave(true, null)).toBe(false)
  })

  it("returns true when logged in with thread id", () => {
    expect(shouldAutoSave(true, "thread-123")).toBe(true)
  })
})
