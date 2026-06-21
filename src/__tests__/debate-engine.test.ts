import { describe, it, expect } from "vitest"
import {
  reducer,
  createMessageId,
  createSystemMessage,
  getApiMessages,
  getAIMessageCount,
  resolveProviderContent,
} from "@/hooks/useDebateEngine"
import type { State } from "@/hooks/useDebateEngine"
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

  it("TOGGLE_MODEL removes model if more than two", () => {
    const state = makeState({ activeModels: ["gemini", "claude", "gpt"] })
    const next = reducer(state, { type: "TOGGLE_MODEL", model: "claude" })
    expect(next.activeModels).toEqual(["gemini", "gpt"])
  })

  it("TOGGLE_MODEL refuses to drop below two models (debate needs at least two)", () => {
    const state = makeState({ activeModels: ["gemini", "claude"] })
    const next = reducer(state, { type: "TOGGLE_MODEL", model: "claude" })
    expect(next.activeModels).toEqual(["gemini", "claude"])
  })

  it("TOGGLE_MODEL refuses to remove last model", () => {
    const state = makeState({ activeModels: ["gemini"] })
    const next = reducer(state, { type: "TOGGLE_MODEL", model: "gemini" })
    expect(next.activeModels).toEqual(["gemini"])
  })

  it("UPDATE_MESSAGE updates matching message and leaves others unchanged", () => {
    const state = makeState({ messages: [userMsg, systemMsg, aiMsg] })
    const next = reducer(state, {
      type: "UPDATE_MESSAGE",
      id: "system-1",
      content: "Could not complete analysis.",
    })
    expect(next.messages[1].content).toBe("Could not complete analysis.")
    expect(next.messages[0]).toBe(userMsg)
    expect(next.messages[2]).toBe(aiMsg)
  })

  it("UPDATE_MESSAGE is a no-op when id does not match", () => {
    const state = makeState({ messages: [userMsg, aiMsg] })
    const next = reducer(state, {
      type: "UPDATE_MESSAGE",
      id: "nonexistent",
      content: "Should not appear",
    })
    expect(next.messages).toEqual(state.messages)
  })

  it("UPDATE_MESSAGE targets the matching AI placeholder only", () => {
    const state = makeState({
      messages: [
        userMsg,
        { ...aiMsg, id: "gemini-old", content: "Old partial response" },
        { ...aiMsg, id: "gpt-new", sender: "gpt", displayName: "GPT", content: "" },
      ],
    })
    const next = reducer(state, {
      type: "UPDATE_MESSAGE",
      id: "gemini-old",
      content: "Response cancelled.",
    })
    expect(next.messages[1].content).toBe("Response cancelled.")
    expect(next.messages[2].content).toBe("")
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

/* ---- Additional reducer action tests ---- */

describe("reducer - SET_TYPING", () => {
  it("sets typingModel to a provider", () => {
    const state = makeState()
    const next = reducer(state, { type: "SET_TYPING", model: "gemini" })
    expect(next.typingModel).toBe("gemini")
  })

  it("sets typingModel to null", () => {
    const state = makeState({ typingModel: "claude" })
    const next = reducer(state, { type: "SET_TYPING", model: null })
    expect(next.typingModel).toBeNull()
  })

  it("does not mutate other state fields", () => {
    const state = makeState({ isDebating: true, currentRound: 2 })
    const next = reducer(state, { type: "SET_TYPING", model: "gpt" })
    expect(next.isDebating).toBe(true)
    expect(next.currentRound).toBe(2)
    expect(next.typingModel).toBe("gpt")
  })
})

describe("reducer - SET_DEBATING", () => {
  it("sets isDebating to true", () => {
    const state = makeState()
    const next = reducer(state, { type: "SET_DEBATING", value: true })
    expect(next.isDebating).toBe(true)
  })

  it("sets isDebating to false", () => {
    const state = makeState({ isDebating: true })
    const next = reducer(state, { type: "SET_DEBATING", value: false })
    expect(next.isDebating).toBe(false)
  })
})

describe("reducer - SET_VERDICT", () => {
  it("sets verdict result", () => {
    const state = makeState()
    const next = reducer(state, { type: "SET_VERDICT", result: verdictData })
    expect(next.verdict).toBe(verdictData)
  })

  it("replaces existing verdict", () => {
    const newVerdict: VerdictResult = {
      ...verdictData,
      recommendedAnswer: "Choose Option B.",
      confidence: 92,
    }
    const state = makeState({ verdict: verdictData })
    const next = reducer(state, { type: "SET_VERDICT", result: newVerdict })
    expect(next.verdict).toBe(newVerdict)
    expect(next.verdict!.recommendedAnswer).toBe("Choose Option B.")
  })
})

describe("reducer - SET_ROUND", () => {
  it("sets currentRound to a number", () => {
    const state = makeState()
    const next = reducer(state, { type: "SET_ROUND", round: 3 })
    expect(next.currentRound).toBe(3)
  })

  it("sets currentRound back to zero", () => {
    const state = makeState({ currentRound: 5 })
    const next = reducer(state, { type: "SET_ROUND", round: 0 })
    expect(next.currentRound).toBe(0)
  })
})

describe("reducer - SET_MODELS", () => {
  it("sets activeModels", () => {
    const state = makeState()
    const next = reducer(state, { type: "SET_MODELS", models: ["claude", "gpt"] })
    expect(next.activeModels).toEqual(["claude", "gpt"])
  })

  it("replaces existing models completely", () => {
    const state = makeState({ activeModels: ["gemini", "perplexity"] })
    const next = reducer(state, { type: "SET_MODELS", models: ["claude"] })
    expect(next.activeModels).toEqual(["claude"])
  })
})

describe("reducer - SET_THREAD_ID", () => {
  it("sets threadId", () => {
    const state = makeState()
    const next = reducer(state, { type: "SET_THREAD_ID", id: "thread-abc" })
    expect(next.threadId).toBe("thread-abc")
  })

  it("sets threadId to null", () => {
    const state = makeState({ threadId: "thread-abc" })
    const next = reducer(state, { type: "SET_THREAD_ID", id: null })
    expect(next.threadId).toBeNull()
  })
})

describe("reducer - HYDRATE_THREAD", () => {
  it("hydrates messages and verdict", () => {
    const state = makeState({ isDebating: true, currentRound: 3, typingModel: "gemini" })
    const msgs = [userMsg, aiMsg]
    const next = reducer(state, {
      type: "HYDRATE_THREAD",
      messages: msgs,
      verdict: verdictData,
      showSummary: true,
    })
    expect(next.messages).toBe(msgs)
    expect(next.verdict).toBe(verdictData)
    expect(next.showSummary).toBe(true)
    expect(next.isDebating).toBe(false)
    expect(next.currentRound).toBe(0)
    expect(next.typingModel).toBeNull()
  })

  it("hydrates with null verdict and no summary", () => {
    const state = makeState()
    const next = reducer(state, {
      type: "HYDRATE_THREAD",
      messages: [userMsg],
      verdict: null,
      showSummary: false,
    })
    expect(next.messages).toEqual([userMsg])
    expect(next.verdict).toBeNull()
    expect(next.showSummary).toBe(false)
  })

  it("preserves activeModels and threadId", () => {
    const state = makeState({ activeModels: ["claude", "gpt"], threadId: "t-1" })
    const next = reducer(state, {
      type: "HYDRATE_THREAD",
      messages: [],
      verdict: null,
      showSummary: false,
    })
    expect(next.activeModels).toEqual(["claude", "gpt"])
    expect(next.threadId).toBe("t-1")
  })
})

describe("reducer - default case (unknown action)", () => {
  it("returns state unchanged for unknown action type", () => {
    const state = makeState({ currentRound: 7, isDebating: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const next = reducer(state, { type: "UNKNOWN_ACTION" } as any)
    expect(next).toBe(state)
  })
})

describe("resolveProviderContent", () => {
  it("returns cleaned content when stream had real text", () => {
    const result = resolveProviderContent("Option A is the better choice.", false, "en", "gemini")
    expect(result).toBe("Option A is the better choice.")
  })

  it("substitutes EN snack-break fallback when server flags empty", () => {
    const result = resolveProviderContent("", true, "en", "gemini")
    expect(result).toBe("Gemini stepped out for a snack break. Back soon.")
  })

  it("substitutes KO snack-break fallback when server flags empty", () => {
    const result = resolveProviderContent("", true, "ko", "gemini")
    expect(result).toBe("Gemini 잠깐 간식 먹으러 갔어요. 곧 돌아올게요.")
  })

  it("substitutes fallback when raw content is whitespace only", () => {
    const result = resolveProviderContent("   \n\t  ", false, "en", "claude")
    expect(result).toBe("Claude stepped out for a snack break. Back soon.")
  })

  it("substitutes fallback when cleanResponse strips content to nothing", () => {
    // cleanResponse removes citation markers and horizontal rules; if that's
    // all the model returned we should still surface the fallback.
    const result = resolveProviderContent("[1][2][3]", false, "en", "perplexity")
    expect(result).toBe("Perplexity stepped out for a snack break. Back soon.")
  })

  it("uses provider display name in the fallback", () => {
    expect(resolveProviderContent("", true, "en", "gpt")).toBe(
      "GPT stepped out for a snack break. Back soon."
    )
  })

  it("does not call fallback when content has any real text", () => {
    const result = resolveProviderContent("Yes.", false, "en", "gemini")
    expect(result).toBe("Yes.")
  })
})
