import { afterEach, describe, expect, it, vi } from "vitest"
import {
  MAX_IMAGE_CHARS_PER_REQUEST,
  capImages,
  modelImage,
  threadParts,
  withTextOnlyRetry,
} from "@/lib/image-parts"
import { fetchConsensusWithFallback } from "@/hooks/useDebateEngine"
import type { Message, MessageImage } from "@/types"

const img = (name: string, size = 8): MessageImage => ({ name, data: "A".repeat(size) })

function user(id: string, images?: MessageImage[]): Message {
  return {
    id,
    sender: "user",
    displayName: "You",
    content: id,
    timestamp: new Date(0),
    ...(images ? { images } : {}),
  }
}

const names = (msgs: Message[]) => msgs.flatMap((m) => (m.images ?? []).map((i) => i.name))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("capImages", () => {
  it("keeps the 4 newest images across the history", () => {
    const msgs = [user("a", [img("1"), img("2")]), user("b", [img("3"), img("4"), img("5")])]
    expect(names(capImages(msgs))).toEqual(["2", "3", "4", "5"])
  })

  it("older images go text-only and keep their text", () => {
    const newer = [img("2"), img("3"), img("4"), img("5")]
    const msgs = capImages([user("a", [img("1")]), user("b", newer)])
    expect(msgs[0].images).toBeUndefined()
    expect(msgs[0].content).toBe("a")
  })

  it("stays within 3 MB of image base64", () => {
    const big = MAX_IMAGE_CHARS_PER_REQUEST / 2
    const msgs = [user("a", [img("old", big)]), user("b", [img("mid", big), img("new", big)])]
    expect(names(capImages(msgs))).toEqual(["mid", "new"])
  })

  it("drops images on non-user rows and malformed images", () => {
    const ai = { ...user("c", [img("x")]), sender: "claude" as const }
    const bad = user("d", [{ name: "y", data: "not base64!" }])
    expect(names(capImages([ai, bad]))).toEqual([])
  })
})

describe("threadParts", () => {
  const lead = "L:"
  const tail = ":T"

  it("is one text part when there are no images", () => {
    expect(threadParts([user("hi")], lead, tail)).toEqual([{ text: "L:[You]: hi:T" }])
  })

  it("puts each image right after its own message", () => {
    const parts = threadParts([user("a", [img("1")]), user("b")], lead, tail)
    expect(parts).toEqual([{ text: "L:[You]: a" }, { image: img("1") }, { text: "\n\n[You]: b:T" }])
  })
})

describe("withTextOnlyRetry", () => {
  async function collect(gen: AsyncIterable<string>) {
    const out: string[] = []
    for await (const c of gen) out.push(c)
    return out
  }

  it("retries once text-only when the image request is rejected", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const seen: Message[][] = []
    const run = async function* (msgs: Message[]) {
      seen.push(msgs)
      if (msgs[0].images) throw new Error("400 invalid image")
      yield "ok"
    }
    expect(await collect(withTextOnlyRetry(run, [user("a", [img("1")])], "t"))).toEqual(["ok"])
    expect(seen).toHaveLength(2)
    expect(seen[1][0].images).toBeUndefined()
  })

  it("does not retry once text has streamed", async () => {
    const run = async function* () {
      yield "partial"
      throw new Error("cut")
    }
    await expect(collect(withTextOnlyRetry(run, [user("a", [img("1")])], "t"))).rejects.toThrow(
      "cut"
    )
  })

  it("does not retry a text-only request", async () => {
    const run = vi.fn(async function* () {
      throw new Error("down")
    })
    await expect(collect(withTextOnlyRetry(run, [user("a")], "t"))).rejects.toThrow("down")
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe("modelImage", () => {
  function stubCanvas(width: number, height: number) {
    const calls: string[] = []
    const ctx = {
      fillStyle: "",
      fillRect: () => calls.push(`fill ${ctx.fillStyle}`),
      drawImage: () => calls.push("draw"),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
      toDataURL: vi.fn(() => "data:image/jpeg;base64,SlBFRw=="),
    }
    vi.stubGlobal("createImageBitmap", async () => ({ width, height, close: () => {} }))
    vi.stubGlobal("document", { createElement: () => canvas })
    return { canvas, calls }
  }

  it("scales to a 1568px long side as JPEG 0.85", async () => {
    const { canvas } = stubCanvas(4000, 3000)
    const out = await modelImage(new File(["x"], "rx.jpg", { type: "image/jpeg" }))
    expect([canvas.width, canvas.height]).toEqual([1568, 1176])
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.85)
    expect(out).toEqual({ name: "rx.jpg", data: "SlBFRw==" })
  })

  it("fills a transparent PNG white before drawing", async () => {
    const { calls } = stubCanvas(512, 512)
    await modelImage(new File(["x"], "icon.png", { type: "image/png" }))
    expect(calls).toEqual(["fill #fff", "draw"])
  })
})

describe("consensus request", () => {
  it("never carries image bytes", async () => {
    const fetchMock = vi.fn(async () => Response.json({}))
    vi.stubGlobal("fetch", fetchMock)
    await fetchConsensusWithFallback([user("a", [img("1")])], "en", "short", false, [], false)
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    )
    expect(body.messages[0].images).toBeUndefined()
    expect(body.messages[0].content).toBe("a")
  })
})
