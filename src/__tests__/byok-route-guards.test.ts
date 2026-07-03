import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"

const authMock = vi.hoisted(() => vi.fn())
const getUserProviderApiKeyMock = vi.hoisted(() => vi.fn())
const streamGPTMock = vi.hoisted(() => vi.fn())
const generateGeminiVerdictWithApiKeyMock = vi.hoisted(() => vi.fn())
const generateGoogleAiContentWithApiKeyMock = vi.hoisted(() => vi.fn())

const validVerdict = {
  recommendedAnswer: "Choose Option A.",
  voteSplit: "2/2 unanimous",
  confidence: 88,
  reasons: ["Reason one", "Reason two"],
  minorityView: "Option B could work with different constraints.",
  oppositeCase: "Choose B if latency matters most.",
}

vi.mock("@/lib/auth", () => ({ auth: authMock }))
vi.mock("@/lib/user-api-keys", () => ({ getUserProviderApiKey: getUserProviderApiKeyMock }))
vi.mock("@/lib/providers/gpt", () => ({ streamGPT: streamGPTMock }))
vi.mock("@/lib/providers/claude", () => ({ streamClaude: vi.fn() }))
vi.mock("@/lib/providers/perplexity", () => ({ streamPerplexity: vi.fn() }))
vi.mock("@/lib/providers/gemini", () => ({
  getConfiguredGeminiApiKey: vi.fn(() => "server-gemini-key"),
  generateGeminiVerdictWithApiKey: generateGeminiVerdictWithApiKeyMock,
  generateGoogleAiContentWithApiKey: generateGoogleAiContentWithApiKeyMock,
  streamGemini: vi.fn(),
}))
vi.mock("@/lib/vertex-config", () => ({
  getVertexConfig: () => ({ projectId: "project", location: "us-central1" }),
}))
vi.mock("@google-cloud/vertexai", () => ({
  VertexAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: vi.fn(),
    })),
  })),
  HarmCategory: {
    HARM_CATEGORY_HARASSMENT: "harassment",
    HARM_CATEGORY_DANGEROUS_CONTENT: "dangerous",
  },
  HarmBlockThreshold: { BLOCK_ONLY_HIGH: "high" },
  SchemaType: {
    OBJECT: "object",
    STRING: "string",
    NUMBER: "number",
    ARRAY: "array",
  },
}))

import { POST as chatPOST } from "@/app/api/chat/route"
import { POST as consensusPOST } from "@/app/api/consensus/route"
import { POST as ocrPOST } from "@/app/api/ocr/route"

const messages: Message[] = [
  {
    id: "u1",
    sender: "user",
    displayName: "You",
    content: "Which option?",
    timestamp: new Date(),
  },
  {
    id: "g1",
    sender: "gemini",
    displayName: "Gemini",
    content: "Option A.",
    timestamp: new Date(),
  },
  {
    id: "c1",
    sender: "claude",
    displayName: "Claude",
    content: "Option B.",
    timestamp: new Date(),
  },
]

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("BYOK-required route guards", () => {
  let previousRequireUserApiKeys: string | undefined

  beforeEach(() => {
    previousRequireUserApiKeys = process.env.REQUIRE_USER_API_KEYS
    process.env.REQUIRE_USER_API_KEYS = "true"
    authMock.mockResolvedValue(null)
    getUserProviderApiKeyMock.mockResolvedValue(undefined)
    streamGPTMock.mockImplementation(async function* () {
      yield "server response"
    })
    generateGeminiVerdictWithApiKeyMock.mockResolvedValue(JSON.stringify(validVerdict))
    generateGoogleAiContentWithApiKeyMock.mockResolvedValue("ocr text")
  })

  afterEach(() => {
    if (previousRequireUserApiKeys === undefined) {
      delete process.env.REQUIRE_USER_API_KEYS
    } else {
      process.env.REQUIRE_USER_API_KEYS = previousRequireUserApiKeys
    }
    vi.clearAllMocks()
  })

  it("chat returns no_key before calling the provider when no user key exists", async () => {
    const response = await chatPOST(
      jsonRequest("/api/chat", {
        messages,
        provider: "gpt",
        locale: "en",
        responseLength: "medium",
      })
    )

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({ error: "no_key", provider: "gpt" })
    expect(streamGPTMock).not.toHaveBeenCalled()
  })

  it("consensus returns no_key before using Gemini server credentials", async () => {
    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
      }) as never
    )

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({ error: "no_key", provider: "gemini" })
    expect(generateGeminiVerdictWithApiKeyMock).not.toHaveBeenCalled()
  })

  it("ocr returns no_key before using Gemini server credentials", async () => {
    const response = await ocrPOST(jsonRequest("/api/ocr", { images: ["abc"] }) as never)

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toEqual({ error: "no_key", provider: "gemini" })
    expect(generateGoogleAiContentWithApiKeyMock).not.toHaveBeenCalled()
  })

  it("chat proceeds with the saved user key when BYOK is required", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockResolvedValue("user-gpt-key")

    const response = await chatPOST(
      jsonRequest("/api/chat", {
        messages,
        provider: "gpt",
        locale: "en",
        responseLength: "medium",
      })
    )

    expect(response.status).toBe(200)
    await response.text()
    expect(streamGPTMock).toHaveBeenCalled()
    expect(streamGPTMock.mock.calls[0]?.[4]).toBe("user-gpt-key")
  })

  it("chat proceeds without a user key when BYOK is disabled", async () => {
    process.env.REQUIRE_USER_API_KEYS = "false"

    const response = await chatPOST(
      jsonRequest("/api/chat", {
        messages,
        provider: "gpt",
        locale: "en",
        responseLength: "medium",
      })
    )

    expect(response.status).toBe(200)
    await response.text()
    expect(streamGPTMock).toHaveBeenCalled()
    expect(streamGPTMock.mock.calls[0]?.[4]).toBeUndefined()
  })

  it("consensus proceeds with the saved Gemini key when BYOK is required", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockResolvedValue("user-gemini-key")

    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generateGeminiVerdictWithApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "user-gemini-key" })
    )
  })

  it("consensus falls back to the configured Gemini key when BYOK is unset", async () => {
    delete process.env.REQUIRE_USER_API_KEYS

    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generateGeminiVerdictWithApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "server-gemini-key" })
    )
  })

  it("ocr proceeds with the saved Gemini key when BYOK is required", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockResolvedValue("user-gemini-key")

    const response = await ocrPOST(jsonRequest("/api/ocr", { images: ["abc"] }) as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ text: "ocr text" })
    expect(generateGoogleAiContentWithApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "user-gemini-key" })
    )
  })

  it("ocr falls back to the configured Gemini key when BYOK is disabled", async () => {
    process.env.REQUIRE_USER_API_KEYS = "false"

    const response = await ocrPOST(jsonRequest("/api/ocr", { images: ["abc"] }) as never)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ text: "ocr text" })
    expect(generateGoogleAiContentWithApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "server-gemini-key" })
    )
  })
})
