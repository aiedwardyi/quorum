import type { Message } from "@/types"

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

function buildMessages(systemPrompt: string, messages: Message[]) {
  // Perplexity requires strictly alternating user/assistant roles.
  // In a group chat we have multiple AI messages back-to-back,
  // so we pack the entire thread into one user message instead.
  const thread = messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")

  return [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content: `Here is the discussion so far:\n\n${thread}\n\nPlease respond to the discussion above.`,
    },
  ]
}

function getHeaders() {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set in .env")
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  }
}

export async function queryPerplexity(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: "sonar-pro",
      messages: buildMessages(systemPrompt, messages),
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Perplexity API error (${response.status}): ${error}`)
  }

  const data = await response.json()
  const text = data.choices?.[0]?.message?.content ?? ""

  if (!text) {
    throw new Error("Perplexity returned an empty response")
  }

  return text
}

export async function* streamPerplexity(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: "sonar-pro",
      messages: buildMessages(systemPrompt, messages),
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Perplexity API error (${response.status}): ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body from Perplexity")

  const decoder = new TextDecoder()
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
      if (data === "[DONE]") return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          yield content
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }
}
