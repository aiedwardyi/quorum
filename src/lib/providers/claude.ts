/** Anthropic Claude streaming provider. */
import Anthropic from "@anthropic-ai/sdk"
import type { Message } from "@/types"
import { redactSecrets } from "@/lib/redact-secrets"
import { streamUsage, type ModelUsage, type UsageSink } from "@/lib/host-cost"
import { claudeImage } from "@/lib/image-parts"

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

// Images follow their message's text block; its breakpoint moves to the last image so the cached prefix holds them.
export function buildClaudeContent(messages: Message[]): Anthropic.ContentBlockParam[] {
  const blocks = buildUserContent(messages)
  if (!messages.some((m) => m.images?.length)) return blocks
  return blocks.flatMap((block, i) => {
    const images = messages[i]?.images ?? []
    if (!images.length) return [block]
    const { cache_control, ...text } = block
    const parts: Anthropic.ImageBlockParam[] = images.map(claudeImage)
    if (cache_control) parts[parts.length - 1].cache_control = cache_control
    return [text, ...parts]
  })
}

// Opus 5.5 can't turn thinking off; low effort keeps it light.
export function claudeModelParams(thinkHard: boolean) {
  return thinkHard
    ? {
        model: "claude-opus-5-5",
        thinking: { type: "adaptive" as const },
        output_config: { effort: "low" as const },
      }
    : {
        model: "claude-haiku-5-5",
        thinking: { type: "disabled" as const },
        output_config: { effort: "low" as const },
      }
}

export function claudeUsage(model: string, u: Anthropic.Usage): ModelUsage {
  return {
    model,
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  }
}

export async function* streamClaude(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string,
  thinkHard = false,
  onUsage?: UsageSink
): AsyncGenerator<string> {
  const client = getClient(userApiKey)
  const params = claudeModelParams(thinkHard)
  const content = buildClaudeContent(messages)
  const usage = streamUsage(
    params.model,
    systemPrompt +
      buildUserContent(messages)
        .map((b) => b.text)
        .join(""),
    onUsage
  )

  try {
    const stream = await client.messages.create(
      {
        ...params,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content }],
        stream: true,
      },
      { signal }
    )
    usage.started()

    for await (const event of stream) {
      if (event.type === "message_start") {
        const { inputTokens, cacheReadTokens, cacheWriteTokens } = claudeUsage(
          params.model,
          event.message.usage
        )
        usage.exact({ inputTokens, cacheReadTokens, cacheWriteTokens })
      } else if (event.type === "message_delta") {
        usage.exact({ outputTokens: event.usage.output_tokens })
      } else if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
        usage.text(event.delta.thinking)
      }
      if (process.env.NODE_ENV === "development" && event.type === "message_start") {
        const u = event.message.usage
        console.log(
          `[claude] cache_read=${u.cache_read_input_tokens ?? 0} ` +
            `cache_write=${u.cache_creation_input_tokens ?? 0} input=${u.input_tokens}`
        )
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        usage.text(event.delta.text)
        yield event.delta.text
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(redactSecrets(msg))
  }
}

const CLAUDE_VERDICT_MODEL = "claude-haiku-5-5"

/** Non-streaming JSON verdict for /api/consensus. */
export async function generateClaudeVerdict({
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
  const client = getClient(apiKey)
  try {
    const msg = await client.messages.create(
      {
        model: CLAUDE_VERDICT_MODEL,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      },
      { signal }
    )
    onUsage?.(claudeUsage(CLAUDE_VERDICT_MODEL, msg.usage))
    const text = msg.content.find((b) => b.type === "text")
    return text && text.type === "text" ? text.text : ""
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(redactSecrets(msg))
  }
}
