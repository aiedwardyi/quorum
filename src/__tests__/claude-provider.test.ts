import { describe, it, expect } from "vitest"
import { buildUserContent } from "@/lib/providers/claude"
import type { Message } from "@/types"

function msg(displayName: string, content: string): Message {
  return {
    id: `${displayName}-${content}`,
    sender: displayName.toLowerCase() as Message["sender"],
    displayName,
    content,
    timestamp: new Date(0),
  }
}

describe("buildUserContent", () => {
  it("returns only the trailing instruction block for an empty transcript", () => {
    const blocks = buildUserContent([])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe("\n\nPlease respond to the discussion above.")
    expect(blocks[0].cache_control).toBeUndefined()
  })

  it("caches the lead block only when there is a single message", () => {
    // With one turn the lead and most-recent breakpoints coincide, so the
    // single message block carries exactly one cache_control and the
    // trailing instruction block carries none.
    const blocks = buildUserContent([msg("Claude", "hello")])
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toBe("Here is the discussion so far:\n\n[Claude]: hello")
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" })
    expect(blocks[1].cache_control).toBeUndefined()
  })

  it("places cache breakpoints on the first and last message blocks only", () => {
    // The lead block (framing + first turn, which carries any uploaded
    // file) and the most-recent turn are the two stable prefixes the cache
    // reuses across rounds. Middle turns and the trailing instruction block
    // must NOT get a breakpoint, or the cached prefix would move each round.
    const blocks = buildUserContent([
      msg("Claude", "first"),
      msg("GPT", "second"),
      msg("Gemini", "third"),
    ])
    expect(blocks).toHaveLength(4)
    expect(blocks[0].cache_control).toEqual({ type: "ephemeral" }) // lead
    expect(blocks[1].cache_control).toBeUndefined() // middle turn
    expect(blocks[2].cache_control).toEqual({ type: "ephemeral" }) // most recent
    expect(blocks[3].cache_control).toBeUndefined() // instruction block
  })

  it("renders text byte-identical to a single concatenated transcript", () => {
    // The per-block split exists only so the cache can match at block
    // boundaries; the model must still see exactly the prompt it saw before
    // caching was added (a single joined string).
    const joined = buildUserContent([msg("Claude", "first"), msg("GPT", "second")])
      .map((b) => b.text)
      .join("")
    expect(joined).toBe(
      "Here is the discussion so far:\n\n[Claude]: first" +
        "\n\n[GPT]: second" +
        "\n\nPlease respond to the discussion above."
    )
  })
})
