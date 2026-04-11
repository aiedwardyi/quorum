import { describe, it, expect } from "vitest"
import {
  polishTruncatedResponse,
  stripDanglingStructure,
  getFormattingInstruction,
} from "@/app/api/chat/route"

// These tests cover the truncation-polish helpers and the length-aware
// formatting guidance. The route module has side-effect-free top-level
// code, so it's safe to import its exports from a test without
// triggering a Next.js handler.

describe("stripDanglingStructure", () => {
  it("drops a trailing heading with no body below it", () => {
    const input = "First paragraph ending here.\n\n### Dangling Heading"
    expect(stripDanglingStructure(input)).toBe("First paragraph ending here.")
  })

  it("drops a trailing lone heading marker", () => {
    const input = "Some content here.\n\n### "
    expect(stripDanglingStructure(input)).toBe("Some content here.")
  })

  it("keeps a heading that has real body content below it", () => {
    const input = "Intro.\n\n### Section\nBody paragraph under the section."
    expect(stripDanglingStructure(input)).toBe(
      "Intro.\n\n### Section\nBody paragraph under the section."
    )
  })

  it("drops a trailing lone bullet marker", () => {
    const input = "Final sentence.\n\n- "
    expect(stripDanglingStructure(input)).toBe("Final sentence.")
  })

  it("drops a trailing lone numbered marker", () => {
    const input = "Final sentence.\n\n1. "
    expect(stripDanglingStructure(input)).toBe("Final sentence.")
  })

  it("keeps a full bullet list where the last bullet has content", () => {
    const input = "Summary:\n\n- First\n- Second\n- Third"
    expect(stripDanglingStructure(input)).toBe(
      "Summary:\n\n- First\n- Second\n- Third"
    )
  })

  it("drops a truncated table row that never closed with a pipe", () => {
    const input = "Intro.\n\n| Name | Age |\n|------|-----|\n| Bob | "
    expect(stripDanglingStructure(input)).toBe(
      "Intro.\n\n| Name | Age |\n|------|-----|"
    )
  })

  it("keeps a complete table row", () => {
    const input = "| a | b |\n|---|---|\n| 1 | 2 |"
    expect(stripDanglingStructure(input)).toBe(input)
  })

  it("is a no-op on plain prose", () => {
    const input = "A perfectly normal response ending with a period."
    expect(stripDanglingStructure(input)).toBe(input)
  })
})

describe("polishTruncatedResponse", () => {
  it("keeps a response that already ends in a sentence-terminator", () => {
    const input = "This is the full response. It ends cleanly."
    expect(polishTruncatedResponse(input, 500)).toBe(
      "This is the full response. It ends cleanly."
    )
  })

  it("trims to the last complete sentence when the cut lands mid-sentence", () => {
    const input = "First sentence is complete. Second sentence was cut in the"
    expect(polishTruncatedResponse(input, 500)).toBe("First sentence is complete.")
  })

  it("drops a dangling heading and appends ellipsis when content lacks a sentence end", () => {
    const input = "Opening thought without a period\n\n### New Section"
    const out = polishTruncatedResponse(input, 500)
    expect(out.endsWith("...")).toBe(true)
    expect(out).not.toContain("### New Section")
  })

  it("drops a half-written table row at the end", () => {
    const input = "Comparing options:\n\n| Name | Score |\n|------|-------|\n| Foo | 10 |\n| Bar | "
    const out = polishTruncatedResponse(input, 500)
    expect(out).not.toContain("| Bar |")
    expect(out).toContain("| Foo | 10 |")
  })

  it("strips unmatched bold pair from the tail", () => {
    const input = "Final sentence ends cleanly. **Unclosed"
    const out = polishTruncatedResponse(input, 500)
    expect(out).not.toContain("**")
    expect(out.endsWith(".")).toBe(true)
  })
})

describe("getFormattingInstruction", () => {
  it("short mode forbids headings and allows at most 1 bold", () => {
    const out = getFormattingInstruction("short", false)
    expect(out).toMatch(/plain prose/i)
    expect(out).toContain("#, ##, ###, ####")
    expect(out).toMatch(/at most 1 key phrase/i)
  })

  it("medium mode permits bullets but still forbids headings", () => {
    const out = getFormattingInstruction("medium", false)
    expect(out).toMatch(/numbered list/i)
    expect(out).toContain("#, ##, ###, ####")
    expect(out).toMatch(/2-3 key phrases/i)
    expect(out).toMatch(/structure is a tool, not decoration/i)
  })

  it("long mode unlocks ### / #### headings, tables, and code", () => {
    const out = getFormattingInstruction("long", false)
    expect(out).toMatch(/### or #### subheadings/i)
    expect(out).toMatch(/# or ##/i) // forbids the app-competing levels
    expect(out).toMatch(/GFM tables/i)
    expect(out).toMatch(/code blocks/i)
    expect(out).toMatch(/structure is a tool, not decoration/i)
  })

  it("long mode still forbids horizontal rules and footnotes", () => {
    const out = getFormattingInstruction("long", false)
    expect(out).toMatch(/horizontal rules \(---\)/i)
    expect(out).toMatch(/footnotes/i)
  })

  it("Korean variants exist for all three lengths and mention 평문/구조", () => {
    expect(getFormattingInstruction("short", true)).toContain("평문")
    expect(getFormattingInstruction("medium", true)).toContain("구조는 도구이지 장식이 아닙니다")
    expect(getFormattingInstruction("long", true)).toContain("###")
    expect(getFormattingInstruction("long", true)).toContain("GFM 표")
  })
})
