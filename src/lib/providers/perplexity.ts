/** Perplexity streaming provider. */
import type { Message } from "@/types"
import { redactSecrets } from "@/lib/redact-secrets"
import { createThinkStripper } from "@/lib/strip-think"
import { streamUsage, type ModelUsage, type UsageSink } from "@/lib/host-cost"
import { THREAD_LEAD, THREAD_TAIL, openAiContent, threadParts } from "@/lib/image-parts"

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

function buildMessages(systemPrompt: string, messages: Message[]) {
  // Perplexity requires strictly alternating user/assistant roles.
  // In a group chat we have multiple AI messages back-to-back,
  // so we pack the entire thread into one user message instead.
  return [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: openAiContent(threadParts(messages, THREAD_LEAD, THREAD_TAIL)),
    },
  ]
}

type PerplexityUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  cost?: { total_cost?: number }
}

export function perplexityUsage(
  model: string,
  u: PerplexityUsage | undefined
): ModelUsage | undefined {
  if (!u) return undefined
  const total = u.cost?.total_cost
  return {
    model,
    inputTokens: u.prompt_tokens ?? 0,
    outputTokens: u.completion_tokens ?? 0,
    // Stream chunks carry total_cost 0 until the final one.
    ...(typeof total === "number" && total > 0 ? { costUsd: total } : {}),
  }
}

function getHeaders(userApiKey?: string) {
  const apiKey = userApiKey || process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set in .env")
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
}

export async function* streamPerplexity(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string,
  thinkHard = false,
  onUsage?: UsageSink
): AsyncGenerator<string> {
  const model = thinkHard ? "sonar-reasoning-pro" : "sonar-pro"
  const sent = buildMessages(systemPrompt, messages)
  const promptText = threadParts(messages, THREAD_LEAD, THREAD_TAIL)
    .map((p) => ("text" in p ? p.text : ""))
    .join("")
  const usage = streamUsage(model, systemPrompt + promptText, onUsage)
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: getHeaders(userApiKey),
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: sent,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const error = redactSecrets(await response.text())
    throw new Error(`Perplexity API error (${response.status}): ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body from Perplexity")
  usage.started()

  const decoder = new TextDecoder()
  const stripper = createThinkStripper()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue

      const data = trimmed.slice(5).trim()
      if (data === "[DONE]") {
        const rest = stripper.flush()
        if (rest) yield rest
        return
      }

      try {
        const parsed = JSON.parse(data)
        const reported = perplexityUsage(model, parsed.usage)
        if (reported) usage.exact(reported)
        const content = parsed.choices?.[0]?.delta?.content
        // Raw content, so streamed <think> text counts too.
        if (content) usage.text(content)
        const visible = content ? stripper.push(content) : ""
        if (visible) {
          yield visible
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }
  const rest = stripper.flush()
  if (rest) yield rest
}

/** Non-streaming JSON verdict for /api/consensus (last-resort fallback). */
export async function generatePerplexityVerdict({
  apiKey,
  systemPrompt,
  userPrompt,
  signal,
  onUsage,
}: {
  apiKey?: string
  systemPrompt: string
  userPrompt: string
  signal?: AbortSignal
  onUsage?: UsageSink
}): Promise<string> {
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify({
      model: "sonar-pro",
      max_tokens: 4096,
      // Strong JSON nudge - Sonar is search-first and may still wrap prose.
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nReturn ONLY a single valid JSON object. No markdown fences, no citations, no prose outside the JSON.`,
        },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    }),
    signal,
  })

  if (!response.ok) {
    const error = redactSecrets(await response.text())
    throw new Error(`Perplexity API error (${response.status}): ${error}`)
  }

  const data = await response.json()
  const usage = perplexityUsage("sonar-pro", data.usage)
  if (usage) onUsage?.(usage)
  return data.choices?.[0]?.message?.content ?? ""
}
