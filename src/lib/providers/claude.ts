import Anthropic from "@anthropic-ai/sdk"
import type { Message } from "@/types"

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env")
  }
  return new Anthropic({ apiKey })
}

function buildThread(messages: Message[]): string {
  return messages
    .map((m) => `[${m.displayName}]: ${m.content}`)
    .join("\n\n")
}

export async function* streamClaude(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const client = getClient()
  const thread = buildThread(messages)

  try {
    const stream = await client.messages.create(
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Here is the discussion so far:\n\n${thread}\n\nPlease respond to the discussion above.`,
          },
        ],
        stream: true,
      },
      { signal }
    )

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    const sanitized = msg.replace(/sk-[a-zA-Z0-9-_]+/g, "sk-***")
    throw new Error(sanitized)
  }
}
