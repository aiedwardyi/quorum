import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Message } from "@/types"

const authMock = vi.hoisted(() => vi.fn())
const getUserProviderApiKeyMock = vi.hoisted(() => vi.fn())
const tryConsumeFreeServerAccessMock = vi.hoisted(() => vi.fn())
const peekFreeServerAccessMock = vi.hoisted(() => vi.fn())
const canUseFreeServerAccessMock = vi.hoisted(() => vi.fn())
const tryReserveHostSpendMock = vi.hoisted(() => vi.fn())
const hasServerCredsMock = vi.hoisted(() => vi.fn())
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
vi.mock("@/lib/free-debates", () => ({
  tryConsumeFreeServerAccess: tryConsumeFreeServerAccessMock,
  tryClaimFreeServerAccess: tryConsumeFreeServerAccessMock,
  peekFreeServerAccess: peekFreeServerAccessMock,
  canUseFreeServerAccess: canUseFreeServerAccessMock,
  getFreeDebateStatus: vi.fn(),
}))
const releaseHostSpendMock = vi.hoisted(() => vi.fn())
vi.mock("@/lib/host-spend", () => ({
  tryReserveHostSpend: tryReserveHostSpendMock,
  releaseHostSpend: releaseHostSpendMock,
  estimateHostCallCents: () => 1,
  getDailyBudgetCents: () => 2500,
}))
vi.mock("@/lib/host-credentials", () => ({
  hasServerCreds: hasServerCredsMock,
}))
const generateClaudeVerdictMock = vi.hoisted(() => vi.fn())
const generateGptVerdictMock = vi.hoisted(() => vi.fn())
const generatePerplexityVerdictMock = vi.hoisted(() => vi.fn())

vi.mock("@/lib/providers/gpt", () => ({
  streamGPT: streamGPTMock,
  generateGptVerdict: generateGptVerdictMock,
}))
vi.mock("@/lib/providers/claude", () => ({
  streamClaude: vi.fn(),
  generateClaudeVerdict: generateClaudeVerdictMock,
}))
vi.mock("@/lib/providers/perplexity", () => ({
  streamPerplexity: vi.fn(),
  generatePerplexityVerdict: generatePerplexityVerdictMock,
}))
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
import { resolveUserProviderApiKey } from "@/lib/server-provider-keys"

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
  let previousAuthEnabled: string | undefined

  beforeEach(() => {
    previousRequireUserApiKeys = process.env.REQUIRE_USER_API_KEYS
    process.env.REQUIRE_USER_API_KEYS = "true"
    previousAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED
    process.env.NEXT_PUBLIC_AUTH_ENABLED = "true"
    authMock.mockResolvedValue(null)
    getUserProviderApiKeyMock.mockResolvedValue(undefined)
    tryConsumeFreeServerAccessMock.mockResolvedValue(false)
    peekFreeServerAccessMock.mockResolvedValue(false)
    canUseFreeServerAccessMock.mockResolvedValue(false)
    tryReserveHostSpendMock.mockResolvedValue({ ok: true, day: "2026-07-15", cents: 1 })
    releaseHostSpendMock.mockResolvedValue(undefined)
    hasServerCredsMock.mockReturnValue(true)
    streamGPTMock.mockImplementation(async function* () {
      yield "server response"
    })
    generateGeminiVerdictWithApiKeyMock.mockResolvedValue(JSON.stringify(validVerdict))
    generateClaudeVerdictMock.mockResolvedValue(JSON.stringify(validVerdict))
    generateGptVerdictMock.mockResolvedValue(JSON.stringify(validVerdict))
    generatePerplexityVerdictMock.mockResolvedValue(JSON.stringify(validVerdict))
    generateGoogleAiContentWithApiKeyMock.mockResolvedValue("ocr text")
  })

  afterEach(() => {
    if (previousRequireUserApiKeys === undefined) {
      delete process.env.REQUIRE_USER_API_KEYS
    } else {
      process.env.REQUIRE_USER_API_KEYS = previousRequireUserApiKeys
    }
    if (previousAuthEnabled === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_ENABLED
    } else {
      process.env.NEXT_PUBLIC_AUTH_ENABLED = previousAuthEnabled
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

  it("chat returns key_lookup_failed when the saved key lookup fails", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockRejectedValueOnce(new Error("database unavailable"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    try {
      const response = await chatPOST(
        jsonRequest("/api/chat", {
          messages,
          provider: "gpt",
          locale: "en",
          responseLength: "medium",
        })
      )

      expect(response.status).toBe(500)
      await expect(response.json()).resolves.toEqual({ error: "key_lookup_failed" })
      expect(streamGPTMock).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("consensus returns no_key before using server credentials for any provider", async () => {
    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
      }) as never
    )

    expect(response.status).toBe(402)
    await expect(response.json()).resolves.toMatchObject({
      error: "no_key",
      message: expect.stringMatching(/API key/i),
    })
    expect(generateGeminiVerdictWithApiKeyMock).not.toHaveBeenCalled()
    expect(generateClaudeVerdictMock).not.toHaveBeenCalled()
    expect(generateGptVerdictMock).not.toHaveBeenCalled()
    expect(generatePerplexityVerdictMock).not.toHaveBeenCalled()
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
    getUserProviderApiKeyMock.mockImplementation(async (_userId: string, provider: string) =>
      provider === "gemini" ? "user-gemini-key" : undefined
    )

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

  it("consensus uses a saved Claude key when Gemini is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockImplementation(async (_userId: string, provider: string) =>
      provider === "claude" ? "user-claude-key" : undefined
    )

    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
        preferredProviders: ["claude", "gpt"],
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generateGeminiVerdictWithApiKeyMock).not.toHaveBeenCalled()
    expect(generateClaudeVerdictMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "user-claude-key" })
    )
  })

  it("consensus falls back to Claude when Gemini errors", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockImplementation(async (_userId: string, provider: string) => {
      if (provider === "gemini") return "user-gemini-key"
      if (provider === "claude") return "user-claude-key"
      return undefined
    })
    generateGeminiVerdictWithApiKeyMock.mockRejectedValue(new Error("429 rate limit"))

    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generateClaudeVerdictMock).toHaveBeenCalled()
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

  // ---- Anonymous body-key BYOK (Phase 1) ----

  it("chat uses a request-body key without touching auth or the DB", async () => {
    const response = await chatPOST(
      jsonRequest("/api/chat", {
        messages,
        provider: "gpt",
        locale: "en",
        responseLength: "medium",
        userApiKey: "body-gpt-key",
      })
    )

    expect(response.status).toBe(200)
    await response.text()
    expect(streamGPTMock.mock.calls[0]?.[4]).toBe("body-gpt-key")
    expect(authMock).not.toHaveBeenCalled()
    expect(getUserProviderApiKeyMock).not.toHaveBeenCalled()
  })

  it("consensus uses a request-body gemini key without touching auth", async () => {
    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
        userApiKey: "body-gemini-key",
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generateGeminiVerdictWithApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "body-gemini-key" })
    )
    expect(authMock).not.toHaveBeenCalled()
  })

  it("consensus uses request-body userApiKeys for Claude without touching auth", async () => {
    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
        userApiKeys: { claude: "body-claude-key" },
        preferredProviders: ["claude"],
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generateClaudeVerdictMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "body-claude-key" })
    )
    expect(authMock).not.toHaveBeenCalled()
  })

  it("consensus uses Perplexity as last-resort body key", async () => {
    const response = await consensusPOST(
      jsonRequest("/api/consensus", {
        messages,
        locale: "en",
        responseLength: "medium",
        userApiKeys: { perplexity: "body-pplx-key" },
      }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject(validVerdict)
    expect(generatePerplexityVerdictMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "body-pplx-key" })
    )
    expect(generateGeminiVerdictWithApiKeyMock).not.toHaveBeenCalled()
    expect(authMock).not.toHaveBeenCalled()
  })

  it("ocr uses a request-body gemini key without touching auth", async () => {
    const response = await ocrPOST(
      jsonRequest("/api/ocr", { images: ["abc"], userApiKey: "body-gemini-key" }) as never
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ text: "ocr text" })
    expect(generateGoogleAiContentWithApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "body-gemini-key" })
    )
    expect(authMock).not.toHaveBeenCalled()
  })

  it("chat body key takes precedence over a saved session key", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockResolvedValue("session-gpt-key")

    const response = await chatPOST(
      jsonRequest("/api/chat", {
        messages,
        provider: "gpt",
        locale: "en",
        responseLength: "medium",
        userApiKey: "body-gpt-key",
      })
    )

    expect(response.status).toBe(200)
    await response.text()
    expect(streamGPTMock.mock.calls[0]?.[4]).toBe("body-gpt-key")
    expect(authMock).not.toHaveBeenCalled()
    expect(getUserProviderApiKeyMock).not.toHaveBeenCalled()
  })

  // ---- Auth gate (Phase 2): flag off never touches the session ----

  it("skips the session lookup entirely when auth is disabled, still 402 without a key", async () => {
    process.env.NEXT_PUBLIC_AUTH_ENABLED = "false"
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockResolvedValue("session-gpt-key")

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
    expect(authMock).not.toHaveBeenCalled()
    expect(streamGPTMock).not.toHaveBeenCalled()
  })

  it("does not log the request-body key when the provider errors", async () => {
    const leakyKey = "sk-body-leak-1234567890abcdefghij"
    streamGPTMock.mockImplementation(async function* () {
      yield "partial"
      throw new Error(`Provider auth failed for key ${leakyKey}`)
    })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    try {
      const response = await chatPOST(
        jsonRequest("/api/chat", {
          messages,
          provider: "gpt",
          locale: "en",
          responseLength: "medium",
          userApiKey: leakyKey,
        })
      )
      const streamed = await response.text()

      expect(errorSpy).toHaveBeenCalled()
      for (const call of errorSpy.mock.calls) {
        expect(call.map(String).join(" ")).not.toContain(leakyKey)
      }
      expect(streamed).not.toContain(leakyKey)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("consensus does not log the request-body key when the provider errors", async () => {
    const leakyKey = "AIzaBodyLeakConsensus1234567890abcd"
    generateGeminiVerdictWithApiKeyMock.mockRejectedValue(
      new Error(`Vertex auth failed for key ${leakyKey}`)
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    try {
      const response = await consensusPOST(
        jsonRequest("/api/consensus", {
          messages,
          locale: "en",
          responseLength: "medium",
          userApiKey: leakyKey,
        }) as never
      )
      const bodyText = await response.text()

      expect(errorSpy).toHaveBeenCalled()
      for (const call of errorSpy.mock.calls) {
        expect(call.map(String).join(" ")).not.toContain(leakyKey)
      }
      expect(bodyText).not.toContain(leakyKey)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("ocr does not log the request-body key when the provider errors", async () => {
    const leakyKey = "AIzaBodyLeakOcr1234567890abcdefghij"
    generateGoogleAiContentWithApiKeyMock.mockRejectedValue(
      new Error(`Vertex auth failed for key ${leakyKey}`)
    )
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    try {
      const response = await ocrPOST(
        jsonRequest("/api/ocr", { images: ["abc"], userApiKey: leakyKey }) as never
      )
      const bodyText = await response.text()

      expect(errorSpy).toHaveBeenCalled()
      for (const call of errorSpy.mock.calls) {
        expect(call.map(String).join(" ")).not.toContain(leakyKey)
      }
      expect(bodyText).not.toContain(leakyKey)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe("access codes", () => {
  let previousRequireUserApiKeys: string | undefined
  let previousAccessCodes: string | undefined

  beforeEach(() => {
    previousRequireUserApiKeys = process.env.REQUIRE_USER_API_KEYS
    previousAccessCodes = process.env.ACCESS_CODES
    hasServerCredsMock.mockReturnValue(true)
    tryReserveHostSpendMock.mockResolvedValue({ ok: true, day: "2026-07-15", cents: 1 })
    releaseHostSpendMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (previousRequireUserApiKeys === undefined) {
      delete process.env.REQUIRE_USER_API_KEYS
    } else {
      process.env.REQUIRE_USER_API_KEYS = previousRequireUserApiKeys
    }
    if (previousAccessCodes === undefined) {
      delete process.env.ACCESS_CODES
    } else {
      process.env.ACCESS_CODES = previousAccessCodes
    }
  })

  it("valid access code bypasses the 402 and falls through to server keys", async () => {
    process.env.REQUIRE_USER_API_KEYS = "true"
    process.env.ACCESS_CODES = "alpha-1234, beta-5678"
    const result = await resolveUserProviderApiKey("gemini", "test", undefined, "beta-5678")
    expect(result.blockedResponse).toBeUndefined()
    expect(result.userApiKey).toBeUndefined()
  })

  it("invalid access code still gets the 402", async () => {
    process.env.REQUIRE_USER_API_KEYS = "true"
    process.env.ACCESS_CODES = "alpha-1234"
    const result = await resolveUserProviderApiKey("gemini", "test", undefined, "wrong")
    expect(result.blockedResponse?.status).toBe(402)
  })

  it("access code is ignored when a body key is present", async () => {
    process.env.REQUIRE_USER_API_KEYS = "true"
    process.env.ACCESS_CODES = "alpha-1234"
    const result = await resolveUserProviderApiKey("gemini", "test", "user-key", "alpha-1234")
    expect(result.userApiKey).toBe("user-key")
  })

  it("empty ACCESS_CODES never matches", async () => {
    process.env.REQUIRE_USER_API_KEYS = "true"
    process.env.ACCESS_CODES = ""
    const result = await resolveUserProviderApiKey("gemini", "test", undefined, "")
    expect(result.blockedResponse?.status).toBe(402)
  })
})

describe("free debate grant", () => {
  let previousRequireUserApiKeys: string | undefined
  let previousAuthEnabled: string | undefined

  beforeEach(() => {
    previousRequireUserApiKeys = process.env.REQUIRE_USER_API_KEYS
    previousAuthEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED
    process.env.REQUIRE_USER_API_KEYS = "true"
    process.env.NEXT_PUBLIC_AUTH_ENABLED = "true"
    authMock.mockResolvedValue({ user: { id: "user-1" } })
    getUserProviderApiKeyMock.mockResolvedValue(undefined)
    tryConsumeFreeServerAccessMock.mockResolvedValue(false)
    peekFreeServerAccessMock.mockResolvedValue(false)
    canUseFreeServerAccessMock.mockResolvedValue(false)
    tryReserveHostSpendMock.mockResolvedValue({ ok: true, day: "2026-07-15", cents: 1 })
    releaseHostSpendMock.mockResolvedValue(undefined)
    hasServerCredsMock.mockReturnValue(true)
  })

  afterEach(() => {
    if (previousRequireUserApiKeys === undefined) {
      delete process.env.REQUIRE_USER_API_KEYS
    } else {
      process.env.REQUIRE_USER_API_KEYS = previousRequireUserApiKeys
    }
    if (previousAuthEnabled === undefined) {
      delete process.env.NEXT_PUBLIC_AUTH_ENABLED
    } else {
      process.env.NEXT_PUBLIC_AUTH_ENABLED = previousAuthEnabled
    }
    vi.clearAllMocks()
  })

  it("uses server keys when the signed-in user claims a free debate", async () => {
    canUseFreeServerAccessMock.mockResolvedValue(true)
    tryConsumeFreeServerAccessMock.mockResolvedValue(true)
    const result = await resolveUserProviderApiKey("gpt", "test")
    expect(result.blockedResponse).toBeUndefined()
    expect(result.userApiKey).toBeUndefined()
    expect(tryReserveHostSpendMock).toHaveBeenCalled()
    expect(tryConsumeFreeServerAccessMock).toHaveBeenCalledWith("user-1")
  })

  it("reserves budget before consuming an open free window", async () => {
    const order: string[] = []
    tryReserveHostSpendMock.mockImplementation(async () => {
      order.push("reserve")
      return { ok: true, day: "2026-07-15", cents: 1 }
    })
    tryConsumeFreeServerAccessMock.mockImplementation(async () => {
      order.push("consume")
      return true
    })
    canUseFreeServerAccessMock.mockResolvedValue(true)
    const result = await resolveUserProviderApiKey("gpt", "test")
    expect(result.blockedResponse).toBeUndefined()
    expect(order).toEqual(["reserve", "consume"])
  })

  it("still 402s when free grant is exhausted", async () => {
    canUseFreeServerAccessMock.mockResolvedValue(true)
    tryConsumeFreeServerAccessMock.mockResolvedValue(false)
    const result = await resolveUserProviderApiKey("gpt", "test")
    expect(result.blockedResponse?.status).toBe(402)
    expect(releaseHostSpendMock).toHaveBeenCalledWith(1, "2026-07-15")
  })

  it("402s when host daily budget is exceeded without burning free", async () => {
    canUseFreeServerAccessMock.mockResolvedValue(true)
    tryConsumeFreeServerAccessMock.mockResolvedValue(true)
    tryReserveHostSpendMock.mockResolvedValue({ ok: false, day: "2026-07-15", cents: 1 })
    const result = await resolveUserProviderApiKey("gpt", "test")
    expect(result.blockedResponse?.status).toBe(402)
    await expect(result.blockedResponse?.json()).resolves.toEqual({
      error: "host_budget_exceeded",
      provider: "gpt",
    })
    expect(tryConsumeFreeServerAccessMock).not.toHaveBeenCalled()
  })

  it("does not claim free when the host has no creds for that provider", async () => {
    hasServerCredsMock.mockReturnValue(false)
    tryConsumeFreeServerAccessMock.mockResolvedValue(true)
    const result = await resolveUserProviderApiKey("gpt", "test")
    expect(result.blockedResponse?.status).toBe(402)
    expect(tryConsumeFreeServerAccessMock).not.toHaveBeenCalled()
  })

  it("prefers body key over free grant", async () => {
    tryConsumeFreeServerAccessMock.mockResolvedValue(true)
    const result = await resolveUserProviderApiKey("gpt", "test", "user-key")
    expect(result.userApiKey).toBe("user-key")
    expect(tryConsumeFreeServerAccessMock).not.toHaveBeenCalled()
    expect(tryReserveHostSpendMock).not.toHaveBeenCalled()
  })

  it("prefers access code over free grant", async () => {
    process.env.ACCESS_CODES = "alpha-1234"
    tryConsumeFreeServerAccessMock.mockResolvedValue(true)
    const result = await resolveUserProviderApiKey("gpt", "test", undefined, "alpha-1234")
    expect(result.blockedResponse).toBeUndefined()
    expect(tryConsumeFreeServerAccessMock).not.toHaveBeenCalled()
    expect(tryReserveHostSpendMock).toHaveBeenCalled()
  })
})
