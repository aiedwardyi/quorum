/** Honest vote-split: empty/failed panelists must not inflate the denominator. */
import { describe, expect, it } from "vitest"
import { clampVoteSplit, countParticipatingModels } from "@/lib/vote-split"
import type { Message } from "@/types"

const user: Message = {
  id: "user-1",
  sender: "user",
  displayName: "You",
  content: "Monolith or microservices for an MVP?",
  timestamp: new Date(),
}

const claude: Message = {
  id: "claude-1",
  sender: "claude",
  displayName: "Claude",
  content: "Start with a monolith.",
  timestamp: new Date(),
}

const gpt: Message = {
  id: "gpt-1",
  sender: "gpt",
  displayName: "GPT",
  content: "A well-structured monolith ships faster.",
  timestamp: new Date(),
}

const perplexity: Message = {
  id: "pplx-1",
  sender: "perplexity",
  displayName: "Perplexity",
  content: "Monolith first, split later.",
  timestamp: new Date(),
}

describe("countParticipatingModels", () => {
  it("counts real replies and ignores empty-fail Gemini", () => {
    const geminiFail: Message = {
      id: "gemini-1",
      sender: "gemini",
      displayName: "Gemini",
      content: "Gemini couldn't reply this round.",
      timestamp: new Date(),
      failed: true,
    }
    expect(countParticipatingModels([user, perplexity, claude, gpt, geminiFail])).toBe(3)
  })

  it("ignores thinking placeholders so stop cannot verdict on blanks", () => {
    const pending: Message = {
      id: "gemini-pending",
      sender: "gemini",
      displayName: "Gemini",
      content: "",
      timestamp: new Date(),
    }
    expect(countParticipatingModels([user, claude, gpt, pending])).toBe(2)
  })

  it("does not count a prior-turn reply from a model that failed this turn", () => {
    const priorGemini: Message = {
      id: "gemini-old",
      sender: "gemini",
      displayName: "Gemini",
      content: "I answered an earlier question.",
      timestamp: new Date(),
    }
    const followUp: Message = {
      ...user,
      id: "user-2",
      content: "What about an MVP?",
    }
    const geminiFail: Message = {
      id: "gemini-fail",
      sender: "gemini",
      displayName: "Gemini",
      content: "Gemini couldn't reply this round.",
      timestamp: new Date(),
      failed: true,
    }
    expect(
      countParticipatingModels([user, priorGemini, followUp, perplexity, claude, gpt, geminiFail])
    ).toBe(3)
  })
})

describe("clampVoteSplit", () => {
  it("never reports 4/4 when only 3 models replied", () => {
    expect(clampVoteSplit("4/4 unanimous", 3)).toBe("3/3 unanimous")
  })

  it("caps an inflated denominator and numerator", () => {
    expect(clampVoteSplit("3/4 models agree", 3)).toBe("3/3 models agree")
    expect(clampVoteSplit("4/4 unanimous", 2)).toBe("2/2 unanimous")
  })

  it("leaves an already-honest split alone", () => {
    expect(clampVoteSplit("3/3 unanimous", 3)).toBe("3/3 unanimous")
    expect(clampVoteSplit("2/3 models agree", 3)).toBe("2/3 models agree")
  })

  it("raises an undercounted denominator to the real reply count", () => {
    expect(clampVoteSplit("2/2 models agree", 3)).toBe("2/3 models agree")
  })

  it("keeps a split numerator when only the denominator was inflated", () => {
    expect(clampVoteSplit("2/4 models agree", 3)).toBe("2/3 models agree")
  })

  it("does not treat a failed Gemini row as a yes-vote in the fraction", () => {
    const split = clampVoteSplit("4/4 unanimous", 3)
    expect(split).not.toMatch(/4\/4/)
    expect(split).toMatch(/3\/3/)
  })
})
