/** OpenAI GPT streaming provider. */
import OpenAI from "openai"
import type { Message } from "@/types"
import { redactSecrets } from "@/lib/redact-secrets"

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

export async function* streamGPT(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024,
  userApiKey?: string,
  thinkHard = false
): AsyncGenerator<string> {
  const client = getClient(userApiKey)
  const thread = buildThread(messages)

  try {
    const stream = await client.chat.completions.create(
      {
        ...gptModelParams(thinkHard, maxTokens),
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
    throw new Error(redactSecrets(msg))
  }
}

/** Non-streaming JSON verdict for /api/consensus. */
export async function generateGptVerdict({
  apiKey,
  systemPrompt,
  userPrompt,
  signal,
}: {
  apiKey?: string
  systemPrompt: string
  userPrompt: string
  signal?: AbortSignal
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
    return res.choices[0]?.message?.content ?? ""
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    throw new Error(redactSecrets(msg))
  }
}
