import { describe, it, expect } from "vitest"
import { splitAttachments } from "@/lib/message-attachments"

describe("splitAttachments", () => {
  it("leaves a plain message as text", () => {
    expect(splitAttachments("Lease or buy?\n\nThanks")).toEqual({
      text: "Lease or buy?\n\nThanks",
      files: [],
    })
  })

  it("splits typed text from one file block", () => {
    expect(splitAttachments("translate this\n\n--- File: rx.jpg ---\n처방전\n김하늘")).toEqual({
      text: "translate this",
      files: [{ name: "rx.jpg", text: "처방전\n김하늘" }],
    })
  })

  it("splits several files in order", () => {
    const content =
      "compare these\n\n--- File: a.pdf ---\nalpha\n\n--- File: pasted-image-1.png ---\nbeta"
    expect(splitAttachments(content).files).toEqual([
      { name: "a.pdf", text: "alpha" },
      { name: "pasted-image-1.png", text: "beta" },
    ])
  })

  it("handles files sent with no typed text", () => {
    expect(splitAttachments("--- File: notes.txt ---\nhello")).toEqual({
      text: "",
      files: [{ name: "notes.txt", text: "hello" }],
    })
  })

  it("keeps dashes inside file text that are not a header", () => {
    const { files } = splitAttachments("--- File: a.md ---\n--- not a header\nx --- File: y ---")
    expect(files).toEqual([{ name: "a.md", text: "--- not a header\nx --- File: y ---" }])
  })
})
