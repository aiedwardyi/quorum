import { describe, it, expect } from "vitest"
import {
  cleanResponse,
  sanitizeHeadings,
  trimUnclosedTrailingMarkdown,
} from "@/lib/clean-response"

describe("trimUnclosedTrailingMarkdown", () => {
  it("removes just the unclosed ** markers, keeps the content", () => {
    // "Hello **wo" -> "Hello wo": chars after the marker are preserved
    // so the bubble types smoothly and doesn't dump a word at the moment
    // the closing ** arrives.
    expect(trimUnclosedTrailingMarkdown("Hello **wo")).toBe("Hello wo")
  })

  it("keeps balanced ** pairs intact", () => {
    expect(trimUnclosedTrailingMarkdown("Hello **world** bye")).toBe(
      "Hello **world** bye"
    )
  })

  it("keeps partially-closed ** followed by a new unclosed pair", () => {
    // Two complete pairs + a third unclosed one: count = 5 (odd).
    // Only the LAST (unclosed) ** marker gets stripped; its content
    // stays in place.
    expect(
      trimUnclosedTrailingMarkdown("a **b** c **d** e **f")
    ).toBe("a **b** c **d** e f")
  })

  it("removes an unclosed backtick and keeps the code chars visible", () => {
    expect(trimUnclosedTrailingMarkdown("run `npm te")).toBe("run npm te")
  })

  it("keeps balanced backticks intact", () => {
    expect(trimUnclosedTrailingMarkdown("run `npm test` now")).toBe(
      "run `npm test` now"
    )
  })

  it("handles both unclosed ** and unclosed `", () => {
    // ** is odd (3) and ` is odd (1). Both markers stripped, content kept.
    expect(
      trimUnclosedTrailingMarkdown("a **b** c **d** e **f with `code")
    ).toBe("a **b** c **d** e f with code")
  })

  it("is a no-op on plain text with no markers", () => {
    expect(trimUnclosedTrailingMarkdown("nothing to see here")).toBe(
      "nothing to see here"
    )
  })

  it("is monotonic: removing a marker never shortens visible content", () => {
    // displayedText grows char-by-char; after trim the output should
    // never shrink relative to the previous tick (aside from the single
    // marker bytes that are hidden).
    const prev = trimUnclosedTrailingMarkdown("Hello **wor")
    const next = trimUnclosedTrailingMarkdown("Hello **worl")
    // Visible text length grows in lockstep with displayedText
    expect(next.length).toBe(prev.length + 1)
  })
})

describe("sanitizeHeadings", () => {
  it("downgrades h1 at line start to h3", () => {
    expect(sanitizeHeadings("# Title\nBody")).toBe("### Title\nBody")
  })

  it("downgrades h2 at line start to h3", () => {
    expect(sanitizeHeadings("## Title\nBody")).toBe("### Title\nBody")
  })

  it("leaves h3 untouched", () => {
    expect(sanitizeHeadings("### Title")).toBe("### Title")
  })

  it("leaves h4+ untouched", () => {
    expect(sanitizeHeadings("#### Sub\n##### Deeper")).toBe("#### Sub\n##### Deeper")
  })

  it("is idempotent - running twice equals running once", () => {
    const input = "# A\n## B\n### C"
    const once = sanitizeHeadings(input)
    expect(sanitizeHeadings(once)).toBe(once)
  })

  it("handles hashes mid-line without touching them", () => {
    expect(sanitizeHeadings("Text with #hashtag and ##tag mid-sentence.")).toBe(
      "Text with #hashtag and ##tag mid-sentence."
    )
  })

  it("downgrades across multiple lines", () => {
    const input = "# One\nsomething\n## Two\nmore"
    expect(sanitizeHeadings(input)).toBe("### One\nsomething\n### Two\nmore")
  })

  it("does not touch a lone # with no following whitespace", () => {
    expect(sanitizeHeadings("#")).toBe("#")
    expect(sanitizeHeadings("##")).toBe("##")
  })
})

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
