import { streamGemini } from "@/lib/providers/gemini"
import { streamPerplexity } from "@/lib/providers/perplexity"
import type { Message, Provider } from "@/types"

const SYSTEM_PROMPT = `You are in a group discussion with other AI models and a human user.
The human is the decision-maker. Respond to the full conversation
naturally. If you disagree with another model, say so directly and
explain why. If you changed your mind based on new points, say that too.
Be concise — keep responses under 200 words. This is a discussion,
not an essay.`

const DISPLAY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { messages, provider } = body as {
      messages: Message[]
      provider: Provider
    }

    if (!messages || !provider) {
      return new Response(
        JSON.stringify({ error: "Missing messages or provider" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const streamFn =
      provider === "gemini" ? streamGemini : streamPerplexity

    const encoder = new TextEncoder()
    let fullContent = ""

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamFn(SYSTEM_PROMPT, messages)) {
            fullContent += chunk
            // SSE format: each event is "data: ...\n\n"
            const event = `data: ${JSON.stringify({ chunk })}\n\n`
            controller.enqueue(encoder.encode(event))
          }

          // Final event with complete message metadata
          const done = `data: ${JSON.stringify({
            done: true,
            sender: provider,
            displayName: DISPLAY_NAMES[provider],
            content: fullContent,
          })}\n\n`
          controller.enqueue(encoder.encode(done))
          controller.close()
        } catch (error) {
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
