/** OpenAI GPT streaming provider. */
import OpenAI from "openai"
import type { Message } from "@/types"
import { redactSecrets } from "@/lib/redact-secrets"
import { streamUsage, type ModelUsage, type UsageSink } from "@/lib/host-cost"
import { THREAD_LEAD, THREAD_TAIL, openAiContent, threadParts } from "@/lib/image-parts"

function getClient(userApiKey?: string) {
  const apiKey = userApiKey || process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in .env")
  }
  return new OpenAI({ apiKey })
}

function buildThread(messages: Message[]): string {
  return messages.map((m) => `[${m.displayName}]: ${m.content}`).join("\n\n")
}

// Sol rejects reasoning_effort none/minimal; low is its floor.
export function gptModelParams(thinkHard: boolean, maxTokens: number) {
  return thinkHard
    ? {
        model: "gpt-6.1-sol",
        reasoning_effort: "low" as const,
        max_completion_tokens: maxTokens,
      }
    : { model: "gpt-4o", max_tokens: maxTokens }
}

export function gptUsage(model: string, u: OpenAI.CompletionUsage): ModelUsage {
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0
  return {
    model,
    inputTokens: Math.max(0, u.prompt_tokens - cached),
    outputTokens: u.completion_tokens,
    cacheReadTokens: cached,
  }
}

export async function* streamGPT(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string,
  thinkHard = false,
  onUsage?: UsageSink
): AsyncGenerator<string> {
  const client = getClient(userApiKey)
  const thread = buildThread(messages)
  const params = gptModelParams(thinkHard, maxTokens)
  const userContent = `Here is the discussion so far:\n\n${thread}\n\nPlease respond to the discussion above.`
  const usage = streamUsage(params.model, systemPrompt + userContent, onUsage)

  try {
    const stream = await client.chat.completions.create(
      {
        ...params,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: openAiContent(threadParts(messages, THREAD_LEAD, THREAD_TAIL), "low"),
          },
        ],
        stream: true,
        // Usage arrives in a final chunk with no choices.
        stream_options: { include_usage: true },
      },
      { signal }
    )
    usage.started()

    for await (const chunk of stream) {
      if (chunk.usage) usage.exact(gptUsage(params.model, chunk.usage))
      const content = chunk.choices?.[0]?.delta?.content
      if (content) {
        usage.text(content)
        yield content
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(redactSecrets(msg))
  }
}

/** Non-streaming JSON verdict for /api/consensus. */
export async function generateGptVerdict({
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
    const res = await client.chat.completions.create(
      {
        model: "gpt-4o",
        max_tokens: 4096,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      },
      { signal }
    )
    if (res.usage) onUsage?.(gptUsage("gpt-4o", res.usage))
    return res.choices[0]?.message?.content ?? ""
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(redactSecrets(msg))
  }
}
