import { describe, it, expect } from "vitest"
import { pastedFiles } from "@/lib/paste-files"

const clip = (files: File[], text = "") => ({
  files: files as unknown as FileList,
  getData: (type: string) => (type === "text/plain" ? text : ""),
})

const png = (name = "image.png") => new File(["x"], name, { type: "image/png" })

let n = 0
const nextName = (ext: string) => `pasted-image-${++n}.${ext}`

describe("pastedFiles", () => {
  it("attaches a pasted clipboard image under a numbered name", () => {
    const [file] = pastedFiles(clip([png()]), nextName)
    expect(file.name).toMatch(/^pasted-image-\d+\.png$/)
    expect(file.type).toBe("image/png")
  })

  it("gives two pastes of image.png different names", () => {
    const [a] = pastedFiles(clip([png()]), nextName)
    const [b] = pastedFiles(clip([png()]), nextName)
    expect(a.name).not.toBe(b.name)
  })

  it("keeps the real name of files copied in Explorer", () => {
    const files = pastedFiles(clip([png("rx.png"), new File(["x"], "notes.pdf")]), nextName)
    expect(files.map((f) => f.name)).toEqual(["rx.png", "notes.pdf"])
  })

  it("pastes text and attaches nothing when the clipboard also has text", () => {
    expect(pastedFiles(clip([png()], "Q3 revenue"), nextName)).toEqual([])
  })

  it("still attaches when the clipboard text is only whitespace", () => {
    expect(pastedFiles(clip([png()], " \n"), nextName)).toHaveLength(1)
  })

  it("plain text pastes attach nothing", () => {
    expect(pastedFiles(clip([], "hello"), nextName)).toEqual([])
    expect(pastedFiles(clip([]), nextName)).toEqual([])
  })
})
