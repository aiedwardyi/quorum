import { streamGemini } from "@/lib/providers/gemini"
import { streamPerplexity } from "@/lib/providers/perplexity"
import { streamClaude } from "@/lib/providers/claude"
import { streamGPT } from "@/lib/providers/gpt"
import type { Message, Provider, Locale, ResponseLength } from "@/types"

const VALID_PROVIDERS: Provider[] = ["gemini", "perplexity", "claude", "gpt"]

const DISPLAY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
  gpt: "GPT",
}

function getResponseLengthInstruction(length: ResponseLength): string {
  switch (length) {
    case "short":
      return "STRICT LIMIT: Your response MUST be under 75 words."
    case "long":
      return "Give detailed responses — aim for around 300 words."
    default:
      return "Be concise — keep responses under 150 words."
  }
}

function getMaxTokens(length: ResponseLength): number {
  switch (length) {
    case "short":
      return 350
    case "long":
      return 4096
    default:
      return 2048
  }
}

function clampToWordLimit(text: string, wordLimit: number): { text: string; truncated: boolean } {
  const wordRegex = /\S+/g
  let wordCount = 0
  let lastAllowedIndex = text.length
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(text)) !== null) {
    wordCount += 1
    if (wordCount === wordLimit) {
      lastAllowedIndex = wordRegex.lastIndex
    } else if (wordCount > wordLimit) {
      return {
        text: text.slice(0, lastAllowedIndex).trimEnd(),
        truncated: true,
      }
    }
  }

  return { text, truncated: false }
}


function stripUnmatchedPair(text: string, token: string): string {
  const count = text.split(token).length - 1
  if (count % 2 === 0) return text

  const lastIndex = text.lastIndexOf(token)
  if (lastIndex === -1) return text

  return `${text.slice(0, lastIndex)}${text.slice(lastIndex + token.length)}`
}

function polishTruncatedShortResponse(text: string, wordLimit: number): string {
  let result = text.trimEnd()

  // Already ends cleanly - enforce word limit, but re-check if clamping broke the ending
  if (/[.!?。！？]$/u.test(result)) {
    const clamped = clampToWordLimit(result, wordLimit)
    if (!clamped.truncated || /[.!?。！？]$/u.test(clamped.text)) {
      return clamped.text
    }
    result = clamped.text
  }

  // Try to truncate at the last complete sentence
  const sentenceMatches = [...result.matchAll(/[.!?。！？](?=\s|$)/g)]
  if (sentenceMatches.length > 0) {
    const lastSentence = sentenceMatches[sentenceMatches.length - 1]
    const sentenceSafe = result.slice(0, (lastSentence.index ?? 0) + lastSentence[0].length).trimEnd()
    // Accept if we keep at least 30% of the content (works for both EN and KO)
    if (sentenceSafe.length >= result.length * 0.3) {
      result = sentenceSafe
    }
  }

  result = stripUnmatchedPair(result, "**")
  result = stripUnmatchedPair(result, "__")
  result = stripUnmatchedPair(result, "`")
  result = result.replace(/[,:;\-–]\s*$/u, "").trimEnd()
  result = result.replace(/\s+(and|or|but|while|because|if|so|that|which|with|to|for|of|in|on|at|by|from)$/iu, "").trimEnd()

  if (!/[.!?。！？]$/u.test(result)) {
    result = `${result}...`
  }

  return clampToWordLimit(result, wordLimit).text
}

function getSystemPrompt(provider: Provider, locale: Locale, responseLength: ResponseLength): string {
  const lengthLine = getResponseLengthInstruction(responseLength)
  const isKorean = locale === "ko"
  const shortLimitBlock = responseLength === "short" ? `${lengthLine}\n\n` : ""

  return `${shortLimitBlock}${isKorean ? "IMPORTANT: You MUST respond entirely in Korean (한국어). Every word of your response must be in Korean, regardless of what language the user writes in.\n\n" : ""}You are ${DISPLAY_NAMES[provider]} in a group discussion with other AI models and a human user.
Your name is ${DISPLAY_NAMES[provider]}. Always speak as yourself in first person.
Do NOT introduce yourself or state your name. Jump straight into the topic.
NEVER speak as another model. NEVER prefix your response with any name like "[Gemini]:" or "[Claude]:".
The human is the decision-maker. Respond to the full conversation naturally.
If you disagree with another model, say so directly and explain why.
If you changed your mind based on new points, say that too.
${lengthLine}
This is a discussion, not an essay. Write in plain text only.
Do NOT use markdown formatting like headers (#), horizontal rules (---), or bold (**text**).
Do NOT include citations, references, footnotes, URLs, or source numbers like [1][2] in your response.
Do NOT add a "References" or "Refs" section. Just give your opinion directly.
IMPORTANT: You CANNOT access URLs, links, or websites. Do NOT fabricate links, write "(link to article)", or reference URLs in any way. If the user shares a link, say you cannot access it and ask them to paste the content.
NEVER give a lazy one-sentence answer. Even in short mode, provide a substantive response with reasoning. "That depends" or "It varies" alone is not acceptable.
Do NOT roleplay as the user or quote what the user said. Only respond as yourself.
${responseLength === "short" ? `\n${lengthLine}` : ""}`
}

function getStreamFn(provider: Provider) {
  switch (provider) {
    case "gemini":
      return streamGemini
    case "claude":
      return streamClaude
    case "gpt":
      return streamGPT
    case "perplexity":
      return streamPerplexity
  }
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

    if (!VALID_PROVIDERS.includes(provider)) {
      return new Response(
        JSON.stringify({ error: `Invalid provider: ${provider}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const inputMessages = messages.filter((m) => m.sender !== "system" && m.sender !== "verdict")
    const streamFn = getStreamFn(provider)
    const systemPrompt = getSystemPrompt(provider, validatedLocale, validatedResponseLength)
    const maxTokens = getMaxTokens(validatedResponseLength)
    const wordLimit = validatedResponseLength === "short" ? 75 : null
    const encoder = new TextEncoder()
    let fullContent = ""
    let truncatedShortResponse = false

    const stream = new ReadableStream({
      async start(controller) {
        let streamClosed = false
        const closeController = () => {
          if (streamClosed) return
          streamClosed = true
          controller.close()
        }
        const enqueueEvent = (payload: unknown) => {
          if (streamClosed) return
          const event = `data: ${JSON.stringify(payload)}\n\n`
          controller.enqueue(encoder.encode(event))
        }
        const providerAbortController = new AbortController()
        const abortProvider = () => {
          if (!providerAbortController.signal.aborted) {
            providerAbortController.abort()
          }
        }
        const providerSignal =
          typeof AbortSignal.any === "function"
            ? AbortSignal.any([request.signal, providerAbortController.signal])
            : providerAbortController.signal
        const forwardAbort = () => abortProvider()

        if (request.signal.aborted) {
          closeController()
          return
        }
        if (providerSignal === providerAbortController.signal) {
          request.signal.addEventListener("abort", forwardAbort, { once: true })
        }

        try {
          for await (const chunk of streamFn(systemPrompt, inputMessages, providerSignal, maxTokens)) {
            if (request.signal?.aborted) break
            const nextContent = fullContent + chunk
            const limited = wordLimit ? clampToWordLimit(nextContent, wordLimit) : { text: nextContent, truncated: false }
            const nextChunk = limited.text.slice(fullContent.length)

            fullContent = limited.text
            if (!nextChunk) {
              if (limited.truncated) {
                truncatedShortResponse = true
                abortProvider()
                break
              }
              continue
            }

            enqueueEvent({ chunk: nextChunk })

            if (limited.truncated) {
              truncatedShortResponse = true
              abortProvider()
              break
            }
          }

          if (!request.signal?.aborted) {
            if (wordLimit) {
              fullContent = polishTruncatedShortResponse(fullContent, wordLimit)
            }

            enqueueEvent({
              done: true,
              sender: provider,
              displayName: DISPLAY_NAMES[provider],
              content: fullContent,
            })
          }
          closeController()
        } catch (error) {
          if (request.signal?.aborted || (providerAbortController.signal.aborted && truncatedShortResponse)) {
            closeController()
            return
          }
          const msg = error instanceof Error ? error.message : "Unknown error"
          const sanitized = msg.replace(/sk-[a-zA-Z0-9-_]+/g, "sk-***").replace(/pplx-[a-zA-Z0-9-_]+/g, "pplx-***")
          const friendlyError = `${DISPLAY_NAMES[provider]} encountered an error: ${sanitized}`

          // Send error as a chat bubble so the debate can continue with other models
          enqueueEvent({ chunk: friendlyError })
          enqueueEvent({
            done: true,
            sender: provider,
            displayName: DISPLAY_NAMES[provider],
            content: friendlyError,
          })
          closeController()
        } finally {
          request.signal.removeEventListener("abort", forwardAbort)
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
