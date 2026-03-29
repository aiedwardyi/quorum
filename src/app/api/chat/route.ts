import { streamGemini } from "@/lib/providers/gemini"
import { streamPerplexity } from "@/lib/providers/perplexity"
import type { Message, Provider, Locale, ResponseLength } from "@/types"

const DISPLAY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
  gpt: "GPT",
}

function getResponseLengthInstruction(length: ResponseLength): string {
  switch (length) {
    case "short":
      return "Be very concise — keep responses under 75 words."
    case "long":
      return "Give detailed responses — aim for around 300 words."
    default:
      return "Be concise — keep responses under 150 words."
  }
}

function getSystemPrompt(provider: Provider, locale: Locale, responseLength: ResponseLength): string {
  const lengthLine = getResponseLengthInstruction(responseLength)
  const localeLine = locale === "ko" ? "\nAlways respond in Korean." : ""

  return `You are ${DISPLAY_NAMES[provider]} in a group discussion with other AI models and a human user.
Your name is ${DISPLAY_NAMES[provider]}. Always speak as yourself in first person.
NEVER speak as another model. NEVER prefix your response with any name like "[Gemini]:" or "[Claude]:".
The human is the decision-maker. Respond to the full conversation naturally.
If you disagree with another model, say so directly and explain why.
If you changed your mind based on new points, say that too.
${lengthLine} This is a discussion, not an essay.
Do NOT include citations, references, footnotes, URLs, or source numbers like [1][2] in your response.
Do NOT add a "References" or "Refs" section. Just give your opinion directly.${localeLine}`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { messages, provider, locale = "en", responseLength = "medium" } = body as {
      messages: Message[]
      provider: Provider
      locale?: Locale
      responseLength?: ResponseLength
    }

    const validatedLocale: Locale = locale === "en" || locale === "ko" ? locale : "en"
    const validatedResponseLength: ResponseLength =
      responseLength === "short" || responseLength === "medium" || responseLength === "long"
        ? responseLength
        : "medium"

    if (!messages || !Array.isArray(messages) || !provider) {
      return new Response(
        JSON.stringify({ error: "Missing messages or provider" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const streamFn =
      provider === "gemini" ? streamGemini : streamPerplexity

    const systemPrompt = getSystemPrompt(provider, validatedLocale, validatedResponseLength)
    const encoder = new TextEncoder()
    let fullContent = ""

    const stream = new ReadableStream({
      async start(controller) {
        // Listen for client disconnect so we stop generating tokens
        const aborted = request.signal?.aborted
        if (aborted) {
          controller.close()
          return
        }

        request.signal?.addEventListener("abort", () => {
          controller.close()
        })

        try {
          for await (const chunk of streamFn(systemPrompt, messages)) {
            if (request.signal?.aborted) break
            fullContent += chunk
            const event = `data: ${JSON.stringify({ chunk })}\n\n`
            controller.enqueue(encoder.encode(event))
          }

          if (!request.signal?.aborted) {
            const done = `data: ${JSON.stringify({
              done: true,
              sender: provider,
              displayName: DISPLAY_NAMES[provider],
              content: fullContent,
            })}\n\n`
            controller.enqueue(encoder.encode(done))
          }
          controller.close()
        } catch (error) {
          if (request.signal?.aborted) {
            controller.close()
            return
          }
          const msg =
            error instanceof Error ? error.message : "Unknown error"
          const errEvent = `data: ${JSON.stringify({ error: msg })}\n\n`
          controller.enqueue(encoder.encode(errEvent))
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error"
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

