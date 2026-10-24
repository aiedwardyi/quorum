import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const recognizeMock = vi.hoisted(() => vi.fn())

vi.mock("tesseract.js", () => ({
  createWorker: async () => ({ recognize: recognizeMock, terminate: async () => {} }),
}))

import { parseFile, SUPPORTED_EXTENSIONS } from "@/lib/file-parser"

const fetchMock = vi.fn()
let canvas: { width: number; height: number; getContext: () => unknown; toDataURL: unknown }

function stubImage(width: number, height: number) {
  vi.stubGlobal("createImageBitmap", async () => ({ width, height, close: () => {} }))
}

const photo = (name = "rx.jpg") => new File(["x"], name, { type: "image/jpeg" })
const ocrBody = () => JSON.parse(fetchMock.mock.calls[0][1].body)

beforeEach(() => {
  canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillRect: () => {}, drawImage: () => {} }),
    toDataURL: vi.fn(() => "data:image/jpeg;base64,SlBFRw=="),
  }
  vi.stubGlobal("document", { createElement: () => canvas })
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "error").mockImplementation(() => {})
  fetchMock.mockReset().mockResolvedValue(Response.json({ text: "처방전\nAmoxicillin 500mg" }))
  recognizeMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("image attachments", () => {
  it.each(["png", "jpg", "jpeg", "webp"])("supports .%s", (ext) => {
    expect(SUPPORTED_EXTENSIONS.has(ext)).toBe(true)
  })

  it("reads an image through server OCR as JPEG", async () => {
    stubImage(1200, 800)
    const result = await parseFile(photo())
    expect(result).toEqual({ text: "처방전\nAmoxicillin 500mg", usedOCR: true })
    expect(ocrBody()).toMatchObject({ images: ["SlBFRw=="], mimeType: "image/jpeg" })
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.9)
  })

  it("scales a 4000x3000 photo to a 2000px long side", async () => {
    stubImage(4000, 3000)
    await parseFile(photo())
    expect([canvas.width, canvas.height]).toEqual([2000, 1500])
  })

  it("never upscales a small screenshot", async () => {
    stubImage(640, 480)
    await parseFile(photo("shot.png"))
    expect([canvas.width, canvas.height]).toEqual([640, 480])
  })

  it("falls back to Tesseract when server OCR fails", async () => {
    stubImage(1200, 800)
    fetchMock.mockResolvedValue(new Response("", { status: 500 }))
    recognizeMock.mockResolvedValue({ data: { text: " 처방전 " } })
    expect(await parseFile(photo())).toEqual({ text: "처방전", usedOCR: true })
    expect(recognizeMock).toHaveBeenCalledWith(canvas)
  })

  it("an image the browser cannot decode is a parse error", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("decode failed")
    })
    expect(await parseFile(photo("rx.heic"))).toEqual({ text: "", warning: "parse_error" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
