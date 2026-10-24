import { describe, it, expect } from "vitest"
import {
  NO_TEXT_IMAGE,
  composeMessage,
  creepProgress,
  localizeStatus,
  tileState,
  type ComposerFile,
} from "@/lib/attach-send"
import { buildSaveMessages } from "@/hooks/useThreadPersistence"
import type { Message } from "@/types"

const image = { name: "icon.png", data: "SlBFRw==" }
const blankPdf: ComposerFile = { name: "scan.pdf", parsed: { text: "", warning: "empty" } }
const noTextIcon: ComposerFile = { name: "icon.png", parsed: { text: "", warning: "empty" }, image }
const rx: ComposerFile = {
  name: "rx.jpg",
  parsed: { text: "처방전", usedOCR: true },
  image: { name: "rx.jpg", data: "UlhSWA==" },
}

describe("composeMessage", () => {
  it("sends typed text even when every attached file has no text", () => {
    expect(composeMessage("what is this?", [blankPdf])).toEqual({
      text: "what is this?",
      images: [],
    })
  })

  it("sends a no-text image with no typed question", () => {
    expect(composeMessage("", [noTextIcon])).toEqual({
      text: `--- File: icon.png ---\n${NO_TEXT_IMAGE}`,
      images: [image],
    })
  })

  it("keeps the OCR block and the picture for an image with text", () => {
    const sent = composeMessage("translate this", [rx])
    expect(sent?.text).toBe("translate this\n\n--- File: rx.jpg ---\n처방전")
    expect(sent?.images).toEqual([rx.image])
  })

  it("has nothing to send when only a no-text file is left", () => {
    expect(composeMessage("  ", [blankPdf])).toBeNull()
  })

  it("skips files that failed or are too large, and typed text still sends", () => {
    const broken: ComposerFile = { name: "a.docx", parsed: { text: "", warning: "parse_error" } }
    const huge: ComposerFile = { name: "b.png", parsed: { text: "", warning: "too_large" } }
    expect(composeMessage("", [broken, huge])).toBeNull()
    expect(composeMessage("hi", [broken, huge])).toEqual({ text: "hi", images: [] })
  })

  it("an image whose OCR failed still counts when its picture exists", () => {
    const ocrFailed: ComposerFile = { ...noTextIcon, parsed: { text: "", warning: "parse_error" } }
    expect(composeMessage("", [ocrFailed])?.images).toEqual([image])
  })

  it("waits while a file is still reading", () => {
    expect(composeMessage("", [{ ...rx, parsing: true }])).toBeNull()
  })
})

describe("tileState", () => {
  it("a no-text file stays skipped until removed", () => {
    expect(tileState(blankPdf)).toBe("skipped")
  })

  it("a no-text image is ready, not a warning", () => {
    expect(tileState(noTextIcon)).toBe("ready")
  })

  it("an image that failed to decode is skipped", () => {
    expect(tileState({ name: "x.png", parsed: { text: "", warning: "parse_error" } })).toBe(
      "skipped"
    )
  })

  it("reads while parsing", () => {
    expect(tileState({ ...rx, parsing: true })).toBe("reading")
  })
})

describe("creepProgress", () => {
  it("keeps moving while OCR is in flight but never reaches 100", () => {
    let p = 20
    const seen: number[] = []
    for (let i = 0; i < 200; i++) {
      p = creepProgress(p)
      seen.push(p)
    }
    expect(seen[0]).toBeGreaterThan(20)
    expect(seen[9]).toBeGreaterThan(50)
    expect(Math.max(...seen)).toBeLessThan(100)
    expect(seen.every((v, i) => i === 0 || v >= seen[i - 1])).toBe(true)
  })

  it("never pulls back a higher reported value", () => {
    expect(creepProgress(95)).toBe(95)
  })
})

describe("localizeStatus", () => {
  it("shows the tile status in Korean", () => {
    expect(localizeStatus("Reading image...", "ko")).toBe("이미지 읽는 중...")
    expect(localizeStatus("Reading text...", "ko")).toBe("텍스트 읽는 중...")
    expect(localizeStatus("Fallback OCR...", "ko")).toBe("보조 OCR 실행 중...")
    expect(localizeStatus("Reading PDF...", "ko")).toBe("PDF 읽는 중...")
    expect(localizeStatus("Reading page 2/5", "ko")).toBe("2/5 페이지 읽는 중")
    expect(localizeStatus("OCR page 1/3...", "ko")).toBe("1/3 페이지 OCR 중...")
  })

  it("leaves English as is", () => {
    expect(localizeStatus("Reading page 2/5", "en")).toBe("Reading page 2/5")
  })
})

describe("thread saves", () => {
  it("carry the file text but never the image bytes", () => {
    const sent = composeMessage("translate this", [rx])!
    const msg: Message = {
      id: "u1",
      sender: "user",
      displayName: "You",
      content: sent.text,
      timestamp: new Date(0),
      images: sent.images,
    }
    const saved = JSON.stringify(buildSaveMessages([msg], 0))
    expect(saved).toContain("--- File: rx.jpg ---")
    expect(saved).not.toContain("UlhSWA==")
  })
})
