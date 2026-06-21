import Anthropic from "@anthropic-ai/sdk"
import type { Message } from "@/types"
import { redactSecrets } from "@/lib/redact-secrets"

function getClient(userApiKey?: string) {
  const apiKey = userApiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env")
  }
  return new Anthropic({ apiKey })
}

// One content block per transcript message so the prompt cache can match at
// block boundaries. The stable lead block (framing + first message, which
// carries any uploaded file) and the most recent turn each get a cache
// breakpoint, so round N+1 reads round N's prefix instead of rewriting it.
// A single growing block never matches: its breakpoint moves mid-block each
// round, and Anthropic only reuses cached prefixes at block boundaries.
export function buildUserContent(messages: Message[]): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = messages.map((m, i) => ({
    type: "text",
    text:
      i === 0
        ? `Here is the discussion so far:\n\n[${m.displayName}]: ${m.content}`
        : `\n\n[${m.displayName}]: ${m.content}`,
  }))
  if (blocks.length > 0) {
    blocks[0].cache_control = { type: "ephemeral" }
    if (blocks.length > 1) {
      blocks[blocks.length - 1].cache_control = { type: "ephemeral" }
    }
  }
  blocks.push({ type: "text", text: "\n\nPlease respond to the discussion above." })
  return blocks
}

export async function* streamClaude(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string
): AsyncGenerator<string> {
  const client = getClient(userApiKey)

  try {
    const stream = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: buildUserContent(messages) }],
        stream: true,
      },
      { signal }
    )

    for await (const event of stream) {
      if (process.env.NODE_ENV === "development" && event.type === "message_start") {
        const u = event.message.usage
        console.log(
          `[claude] cache_read=${u.cache_read_input_tokens ?? 0} ` +
            `cache_write=${u.cache_creation_input_tokens ?? 0} input=${u.input_tokens}`
        )
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(redactSecrets(msg))
  }
}
