import { describe, it, expect } from "vitest"
import { cleanResponse } from "@/lib/clean-response"

describe("cleanResponse", () => {
  it("strips inline citation markers", () => {
    expect(cleanResponse("This is great[1] and also good[2][3].")).toBe(
      "This is great and also good."
    )
  })

  it("strips grouped citation markers", () => {
    expect(cleanResponse("Result[1][4][5] confirmed.")).toBe("Result confirmed.")
  })

  it("preserves text-based bracket content like [특허 문서]", () => {
    expect(cleanResponse("연구는 밀도 매핑[특허 문서]에 초점을 맞추고 있습니다.")).toBe(
      "연구는 밀도 매핑[특허 문서]에 초점을 맞추고 있습니다."
    )
  })

  it("preserves English text-based bracket content", () => {
    expect(cleanResponse("The study[Patent Document] shows results.")).toBe(
      "The study[Patent Document] shows results."
    )
  })

  it("strips trailing References block", () => {
    const input = "Great answer.\n\nReferences:\n1. Source A\n2. Source B"
    expect(cleanResponse(input)).toBe("Great answer.")
  })

  it("strips trailing Refs block", () => {
    const input = "Good point.\n\n--- Refs:\n- Link 1"
    expect(cleanResponse(input)).toBe("Good point.")
  })

  it("strips trailing Sources block", () => {
    const input = "Nice.\n\nSources:\n1. Foo"
    expect(cleanResponse(input)).toBe("Nice.")
  })

  it("cleans double spaces left behind", () => {
    expect(cleanResponse("Hello  world  test")).toBe("Hello world test")
  })

  it("strips markdown horizontal rules", () => {
    expect(cleanResponse("Some text.\n---\nMore text.")).toBe("Some text.\n\nMore text.")
    expect(cleanResponse("Above\n  ***  \nBelow")).toBe("Above\n\nBelow")
  })

  it("handles empty string", () => {
    expect(cleanResponse("")).toBe("")
  })

  it("handles string with only whitespace", () => {
    expect(cleanResponse("   ")).toBe("")
  })

  it("preserves text with no citations", () => {
    const input = "This is a normal response with no issues."
    expect(cleanResponse(input)).toBe(input)
  })

  it("handles case-insensitive References", () => {
    const input = "Answer.\n\nrEfErEnCeS:\n1. Foo"
    expect(cleanResponse(input)).toBe("Answer.")
  })

  it("decodes HTML entities", () => {
    expect(cleanResponse("a &lt; b &amp; c &gt; d")).toBe("a < b & c > d")
    expect(cleanResponse("it&#x27;s &quot;quoted&quot;")).toBe("it's \"quoted\"")
  })

  it("strips leftover HTML tags", () => {
    expect(cleanResponse("Hello <b>world</b> and <br/> more.")).toBe(
      "Hello world and more."
    )
  })

  it("removes escaped hex control sequences", () => {
    expect(cleanResponse("Text\\x08end")).toBe("Textend")
    expect(cleanResponse("Text\\x0Aend")).toBe("Textend")
  })

  it("removes garbled \\n08lt-style sequences", () => {
    expect(cleanResponse("Good response\\n08lt")).toBe("Good response")
    expect(cleanResponse("Result\\n3foo")).toBe("Result")
  })

  it("removes stray trailing backslash-escaped fragments", () => {
    expect(cleanResponse("Some text\\nlt")).toBe("Some text")
    expect(cleanResponse("Answer\\xyz")).toBe("Answer")
  })
})
