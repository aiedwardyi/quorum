import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"

const gptCreateMock = vi.hoisted(() => vi.fn())
const claudeCreateMock = vi.hoisted(() => vi.fn())
const vertexStreamMock = vi.hoisted(() => vi.fn())

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: gptCreateMock } }
  },
}))
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: claudeCreateMock }
  },
}))
vi.mock("@google-cloud/vertexai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@google-cloud/vertexai")>()),
  VertexAI: class {
    getGenerativeModel({ model }: { model: string }) {
      return { generateContentStream: (req: unknown) => vertexStreamMock(model, req) }
    }
  },
}))
vi.mock("@/lib/vertex-config", () => ({ getVertexConfig: () => ({ projectId: "test" }) }))
vi.mock("@/lib/google-credentials", () => ({
  loadGoogleApplicationCredentialsJson: () => undefined,
}))
vi.mock("@/lib/host-cost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host-cost")>()),
  logHostUsage: vi.fn(),
}))
vi.mock("@/lib/server-provider-keys", () => ({
  resolveUserProviderApiKey: async () => ({}),
  isValidAccessCode: () => false,
}))

import { streamClaude } from "@/lib/providers/claude"
import { streamGPT } from "@/lib/providers/gpt"
import { streamPerplexity } from "@/lib/providers/perplexity"
import { streamGemini } from "@/lib/providers/gemini"
import { POST as chatPOST } from "@/app/api/chat/route"

const RX = "UlhSWA=="
const DATA_URI = `data:image/jpeg;base64,${RX}`

const withImage: Message[] = [
  {
    id: "u1",
    sender: "user",
    displayName: "You",
    content: "translate this\n\n--- File: rx.jpg ---\n처방전",
    timestamp: new Date(0),
    images: [{ name: "rx.jpg", data: RX }],
  },
]

async function drain(gen: AsyncIterable<string>) {
  let out = ""
  for await (const c of gen) out += c
  return out
}

async function* gptStream(text = "ok") {
  yield { choices: [{ delta: { content: text } }] }
}

async function* claudeStream() {
  yield { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } }
}

function vertexStream(text = "ok") {
  return {
    stream: (async function* () {
      yield { candidates: [{ content: { parts: [{ text }] } }] }
    })(),
  }
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test")
  vi.stubEnv("ANTHROPIC_API_KEY", "test")
  vi.stubEnv("GEMINI_API_KEY", "")
  gptCreateMock.mockReset()
  claudeCreateMock.mockReset()
  vertexStreamMock.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("image parts per provider", () => {
  it("Claude gets a base64 image block after the message text", async () => {
    claudeCreateMock.mockResolvedValue(claudeStream())
    await drain(streamClaude("sys", withImage))
    const content = claudeCreateMock.mock.calls[0][0].messages[0].content
    expect(content[0]).toMatchObject({ type: "text" })
    expect(content[0].cache_control).toBeUndefined()
    expect(content[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: RX },
      cache_control: { type: "ephemeral" },
    })
    expect(content[2].text).toBe("\n\nPlease respond to the discussion above.")
  })

  it("GPT gets a low-detail image_url data URI", async () => {
    gptCreateMock.mockResolvedValue(gptStream())
    await drain(streamGPT("sys", withImage))
    const user = gptCreateMock.mock.calls[0][0].messages[1]
    expect(user.content[1]).toEqual({
      type: "image_url",
      image_url: { url: DATA_URI, detail: "low" },
    })
  })

  it.each([false, true])("Perplexity gets an image_url data URI (think hard %s)", async (th) => {
    const fetchMock = vi.fn(
      async () => new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n')
    )
    vi.stubGlobal("fetch", fetchMock)
    await drain(streamPerplexity("sys", withImage, undefined, 1024, "key", th))
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    )
    expect(body.model).toBe(th ? "sonar-reasoning-pro" : "sonar-pro")
    expect(body.messages[1].content[1]).toEqual({
      type: "image_url",
      image_url: { url: DATA_URI },
    })
  })

  it("Gemini gets inlineData on 3.8 and again on the 2.5 redo", async () => {
    vertexStreamMock.mockImplementation(async (model: string) => {
      if (model === "gemini-3.8-flash") throw new Error("429 RESOURCE_EXHAUSTED")
      return vertexStream()
    })
    expect(await drain(streamGemini("sys", withImage))).toBe("ok")
    expect(vertexStreamMock.mock.calls.map((c) => c[0])).toEqual([
      "gemini-3.8-flash",
      "gemini-2.5-flash",
    ])
    for (const [, req] of vertexStreamMock.mock.calls) {
      expect(req.contents[0].parts[1]).toEqual({
        inlineData: { mimeType: "image/jpeg", data: RX },
      })
    }
  })
})

describe("chat route", () => {
  async function post(messages: Message[]) {
    const res = await chatPOST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages, provider: "gpt" }),
      })
    )
    return res.text()
  }

  it("retries an image rejection text-only instead of failing the seat", async () => {
    gptCreateMock.mockImplementation(async (params: { messages: { content: unknown }[] }) => {
      if (Array.isArray(params.messages[1].content)) throw new Error("400 invalid image")
      return gptStream("translated")
    })
    const sse = await post(withImage)
    expect(sse).toContain('"done":true')
    expect(sse).toContain('"content":"translated"')
    expect(sse).not.toContain('"error"')
    expect(gptCreateMock).toHaveBeenCalledTimes(2)
    expect(typeof gptCreateMock.mock.calls[1][0].messages[1].content).toBe("string")
  })

  it("sends at most 4 images, the newest", async () => {
    gptCreateMock.mockResolvedValue(gptStream())
    const images = ["1", "2", "3", "4", "5"].map((n) => ({ name: `${n}.jpg`, data: RX }))
    await post([{ ...withImage[0], images }])
    const parts = gptCreateMock.mock.calls[0][0].messages[1].content
    expect(parts.filter((p: { type: string }) => p.type === "image_url")).toHaveLength(4)
  })
})
