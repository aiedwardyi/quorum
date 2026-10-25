import { describe, it, expect } from "vitest"
import { answersByVerdict } from "@/lib/verdict-answers"
import type { Message } from "@/types"

let n = 0
const msg = (sender: Message["sender"], content = "answer", over: Partial<Message> = {}) =>
  ({
    id: `m${++n}`,
    sender,
    displayName: sender,
    content,
    timestamp: new Date(0),
    ...over,
  }) as Message

const ids = (answers: { id: string }[] | undefined) => answers?.map((a) => a.id)

describe("answersByVerdict", () => {
  it("links a verdict to each AI's answer in thread order", () => {
    const thread = [
      msg("user"),
      msg("gpt"),
      msg("claude"),
      msg("gemini"),
      msg("perplexity"),
      msg("verdict"),
    ]
    const answers = answersByVerdict(thread).get(thread[5].id)
    expect(ids(answers)).toEqual(thread.slice(1, 5).map((m) => m.id))
    expect(answers?.map((a) => a.provider)).toEqual(["gpt", "claude", "gemini", "perplexity"])
  })

  it("keeps only the latest answer per AI across rounds", () => {
    const thread = [
      msg("user"),
      msg("gpt"),
      msg("claude"),
      msg("gpt"),
      msg("claude"),
      msg("verdict"),
    ]
    expect(ids(answersByVerdict(thread).get(thread[5].id))).toEqual([thread[3].id, thread[4].id])
  })

  it("skips user, system, empty and failed messages", () => {
    const thread = [
      msg("user"),
      msg("gpt", "  "),
      msg("claude", "No API key", { failed: true }),
      msg("gemini"),
      msg("system", "Analyzing"),
      msg("verdict"),
    ]
    expect(ids(answersByVerdict(thread).get(thread[5].id))).toEqual([thread[3].id])
  })

  it("gives each verdict in a thread its own round", () => {
    const thread = [
      msg("user"),
      msg("gpt"),
      msg("claude"),
      msg("verdict"),
      msg("user"),
      msg("claude"),
      msg("verdict"),
    ]
    const byVerdict = answersByVerdict(thread)
    expect(ids(byVerdict.get(thread[3].id))).toEqual([thread[1].id, thread[2].id])
    expect(ids(byVerdict.get(thread[6].id))).toEqual([thread[5].id])
  })

  it("returns no answers for a verdict with none before it", () => {
    const thread = [msg("user"), msg("verdict")]
    expect(answersByVerdict(thread).get(thread[1].id)).toEqual([])
  })
})
