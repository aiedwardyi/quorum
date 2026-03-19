import type { Message } from "@/types"

const PERPLEXITY_URL = "https://api.perplexity.ai/chat/completions"

export async function queryPerplexity(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY

  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set in .env")
  }

  const formattedMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((msg) => ({
      role: (msg.sender === "user" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: `[${msg.displayName}]: ${msg.content}`,
    })),
  ]

  const response = await fetch(PERPLEXITY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: formattedMessages,
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
