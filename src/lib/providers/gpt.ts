import OpenAI from "openai"
import type { Message } from "@/types"

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in .env")
  }
  return new OpenAI({ apiKey })
}

function buildThread(messages: Message[]): string {
  return messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")
}

export async function* streamGPT(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024
): AsyncGenerator<string> {
  const client = getClient()
  const thread = buildThread(messages)

  try {
    const stream = await client.chat.completions.create(
      {
        model: "gpt-4o",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Here is the discussion so far:\n\n${thread}\n\nPlease respond to the discussion above.`,
          },
        ],
        stream: true,
      },
      { signal }
    )

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content
      if (content) {
        yield content
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    const sanitized = msg.replace(/sk-[a-zA-Z0-9-_]+/g, "sk-***")
    throw new Error(sanitized)
  }
}
