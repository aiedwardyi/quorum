import { describe, it, expect } from "vitest"
import {
  reducer,
  createMessageId,
  createSystemMessage,
  getApiMessages,
  getAIMessageCount,
} from "@/hooks/useDebateEngine"
import type { State, Action } from "@/hooks/useDebateEngine"
import type { Message, VerdictResult } from "@/types"

/* ---- Test data ---- */

const makeState = (overrides: Partial<State> = {}): State => ({
  messages: [],
  activeModels: ["gemini", "perplexity"],
  verdict: null,
  isDebating: false,
  currentRound: 0,
  typingModel: null,
  showSummary: false,
  threadId: null,
  ...overrides,
})

const userMsg: Message = {
  id: "user-1",
  sender: "user",
  displayName: "You",
  content: "Which is better?",
  timestamp: new Date(),
}

const aiMsg: Message = {
  id: "gemini-1",
  sender: "gemini",
  displayName: "Gemini",
  content: "Option A is better.",
  timestamp: new Date(),
}

const systemMsg: Message = {
  id: "system-1",
  sender: "system",
  displayName: "System",
  content: "Round 2",
  timestamp: new Date(),
}

const verdictData: VerdictResult = {
  recommendedAnswer: "Choose Option A.",
  voteSplit: "3/4 models agree",
  confidence: 85,
  reasons: ["Faster", "Cheaper"],
  minorityView: "Option B scales better.",
  oppositeCase: "When you need maximum throughput.",
}

const verdictMsg: Message = {
  id: "verdict-1",
  sender: "verdict",
  displayName: "Verdict",
  content: "Choose Option A.",
  timestamp: new Date(),
  verdictData,
}

/* ---- Reducer tests ---- */

describe("reducer", () => {
  it("ADD_MESSAGE appends to messages", () => {
    const state = makeState()
    const next = reducer(state, { type: "ADD_MESSAGE", message: userMsg })
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]).toBe(userMsg)
  })

  it("ADD_MESSAGE with verdict sender works", () => {
    const state = makeState({ messages: [userMsg, aiMsg] })
    const next = reducer(state, { type: "ADD_MESSAGE", message: verdictMsg })
    expect(next.messages).toHaveLength(3)
    expect(next.messages[2].sender).toBe("verdict")
    expect(next.messages[2].verdictData).toBe(verdictData)
  })

  it("UPDATE_LAST_AI_CONTENT updates last AI message", () => {
    const state = makeState({ messages: [userMsg, aiMsg] })
    const next = reducer(state, { type: "UPDATE_LAST_AI_CONTENT", content: "Updated." })
    expect(next.messages[1].content).toBe("Updated.")
  })

  it("UPDATE_LAST_AI_CONTENT skips verdict messages", () => {
    const state = makeState({ messages: [userMsg, verdictMsg] })
    const next = reducer(state, { type: "UPDATE_LAST_AI_CONTENT", content: "Should not apply" })
    expect(next.messages[1].content).toBe("Choose Option A.")
  })

  it("UPDATE_LAST_AI_CONTENT skips user messages", () => {
    const state = makeState({ messages: [userMsg] })
    const next = reducer(state, { type: "UPDATE_LAST_AI_CONTENT", content: "Nope" })
    expect(next.messages[0].content).toBe("Which is better?")
  })

  it("CONTINUE_THREAD clears showSummary but keeps messages", () => {
    const state = makeState({
      messages: [userMsg, aiMsg, verdictMsg],
      showSummary: true,
      verdict: verdictData,
      currentRound: 3,
    })
    const next = reducer(state, { type: "CONTINUE_THREAD" })
    expect(next.showSummary).toBe(false)
    expect(next.currentRound).toBe(0)
    expect(next.messages).toHaveLength(3) // messages preserved
  })

  it("SHOW_SUMMARY sets flags correctly", () => {
    const state = makeState({ isDebating: true, typingModel: "gemini" })
    const next = reducer(state, { type: "SHOW_SUMMARY" })
    expect(next.showSummary).toBe(true)
    expect(next.isDebating).toBe(false)
    expect(next.typingModel).toBeNull()
  })

  it("TOGGLE_MODEL adds model", () => {
    const state = makeState({ activeModels: ["gemini"] })
    const next = reducer(state, { type: "TOGGLE_MODEL", model: "claude" })
    expect(next.activeModels).toEqual(["gemini", "claude"])
  })

  it("TOGGLE_MODEL removes model if more than one", () => {
    const state = makeState({ activeModels: ["gemini", "claude"] })
    const next = reducer(state, { type: "TOGGLE_MODEL", model: "claude" })
    expect(next.activeModels).toEqual(["gemini"])
  })

  it("TOGGLE_MODEL refuses to remove last model", () => {
    const state = makeState({ activeModels: ["gemini"] })
    const next = reducer(state, { type: "TOGGLE_MODEL", model: "gemini" })
    expect(next.activeModels).toEqual(["gemini"])
  })

  it("RESET returns initial state with current models", () => {
    const state = makeState({
      messages: [userMsg, aiMsg],
      activeModels: ["claude", "gpt"],
      isDebating: true,
      currentRound: 3,
    })
    const next = reducer(state, { type: "RESET" })
    expect(next.messages).toEqual([])
    expect(next.activeModels).toEqual(["claude", "gpt"])
    expect(next.isDebating).toBe(false)
  })
})

/* ---- Helper function tests ---- */

describe("createMessageId", () => {
  it("returns unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createMessageId("test")))
    expect(ids.size).toBe(100)
  })

  it("includes prefix", () => {
    const id = createMessageId("user")
    expect(id.startsWith("user-")).toBe(true)
  })
})

describe("createSystemMessage", () => {
  it("creates EN system message", () => {
    const msg = createSystemMessage("Round 1", "en")
    expect(msg.sender).toBe("system")
    expect(msg.displayName).toBe("System")
    expect(msg.content).toBe("Round 1")
  })

  it("creates KO system message", () => {
    const msg = createSystemMessage("라운드 1", "ko")
    expect(msg.displayName).toBe("시스템")
  })
})

describe("getApiMessages", () => {
  it("filters out system messages", () => {
    const result = getApiMessages([userMsg, systemMsg, aiMsg])
    expect(result).toHaveLength(2)
    expect(result.map((m) => m.sender)).toEqual(["user", "gemini"])
  })

  it("filters out verdict messages", () => {
    const result = getApiMessages([userMsg, aiMsg, verdictMsg])
    expect(result).toHaveLength(2)
    expect(result.map((m) => m.sender)).toEqual(["user", "gemini"])
  })

  it("filters out both system and verdict", () => {
    const result = getApiMessages([userMsg, systemMsg, aiMsg, verdictMsg])
    expect(result).toHaveLength(2)
  })

  it("returns empty array for empty input", () => {
    expect(getApiMessages([])).toEqual([])
  })
})

describe("getAIMessageCount", () => {
  it("counts only AI provider messages", () => {
    expect(getAIMessageCount([userMsg, aiMsg, systemMsg, verdictMsg])).toBe(1)
  })

  it("counts multiple AI messages", () => {
    const claudeMsg: Message = { ...aiMsg, id: "claude-1", sender: "claude" }
    expect(getAIMessageCount([userMsg, aiMsg, claudeMsg])).toBe(2)
  })

  it("returns 0 for no AI messages", () => {
    expect(getAIMessageCount([userMsg, systemMsg])).toBe(0)
  })
})
