import { streamGemini } from "@/lib/providers/gemini"
import { streamPerplexity } from "@/lib/providers/perplexity"
import { streamClaude } from "@/lib/providers/claude"
import { streamGPT } from "@/lib/providers/gpt"
import { isPredominantlyKorean } from "@/lib/detect-language"
import { getUrlCapabilityInstruction } from "@/lib/url-access"
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
      return "STRICT LIMIT: Your response MUST be under 75 words. Hard cap, do not exceed."
    case "long":
      return "Give a detailed response of around 250 words. Hard cap at 320 words, do not exceed."
    default:
      return "Be concise. Target 120 words, hard cap at 170 words, do not exceed."
  }
}

function getMaxTokens(length: ResponseLength): number {
  switch (length) {
    case "short":
      // Korean uses 2-3x more tokens than English in Gemini's tokenizer.
      // Bumped from 350 to 800 so short responses don't get cut mid-sentence
      // in Korean. Output is still clamped by clampToWordLimit downstream.
      return 800
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

  while (wordRegex.exec(text) !== null) {
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

function polishTruncatedResponse(text: string, wordLimit: number): string {
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

function getSystemPrompt(provider: Provider, locale: Locale, responseLength: ResponseLength, forceKorean: boolean): string {
  const lengthLine = getResponseLengthInstruction(responseLength)
  const isKorean = locale === "ko" || forceKorean
  const shortLimitBlock = responseLength === "short" ? `${lengthLine}\n\n` : ""

  return `${shortLimitBlock}${isKorean ? "CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in Korean (한국어). Every single word of your response - including names, technical terms, and explanations - must be written in Korean. Do NOT use any English words except for proper nouns that have no Korean equivalent. The user's document is in Korean and they expect a Korean response. If you respond in English, the response is wrong.\n\nDo NOT switch languages mid-response. Stay in Korean from first character to last.\n\n" : "CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in English. Every sentence, every bullet, every summary line must be in English. Do NOT insert Korean, Japanese, Chinese, or any other language anywhere in your response - not even for a 'key points' recap or a translated quote. If you see non-English text in prior AI responses, IGNORE their language choice and respond in English regardless. Do NOT switch languages mid-response. Stay in English from first character to last.\n\n"}You are ${DISPLAY_NAMES[provider]} in a group discussion with other AI models and a human user.
Your name is ${DISPLAY_NAMES[provider]}. Always speak as yourself in first person.
Do NOT introduce yourself or state your name. Jump straight into the topic.
NEVER speak as another model. NEVER prefix your response with any name like "[Gemini]:" or "[Claude]:".
The human is the decision-maker. Respond to the full conversation naturally.
If you disagree with another model, say so directly and explain why.
If you changed your mind based on new points, say that too.
${lengthLine}
This is a discussion, not an essay. Write in plain text with light markdown only.
Do NOT use headers (#) or horizontal rules (---).
Use **bold** sparingly to highlight at most 2-3 key phrases per response, and only when it genuinely helps the reader scan. Never bold more than 3 spans. Do NOT bold whole sentences. Do NOT bold generic filler words. If nothing is truly important, use zero bolds.
Do NOT include citations, references, footnotes, URLs, or source numbers like [1][2] in your response.
Do NOT add a "References" or "Refs" section. Just give your opinion directly.
${getUrlCapabilityInstruction(provider)} However, when the user's message includes document text (between "--- File:" markers), that content HAS ALREADY BEEN EXTRACTED and is part of the message - read and analyze it directly.
NEVER give a lazy one-sentence answer. Even in short mode, provide a substantive response with reasoning. "That depends" or "It varies" alone is not acceptable.
Do NOT roleplay as the user or quote what the user said. Only respond as yourself.`
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
    // CRITICAL: only consider the USER's own messages when detecting the
    // conversation language. Otherwise one AI that hallucinates a Korean
    // summary mid-response tips the ratio and forces every subsequent
    // provider in the debate to respond entirely in Korean - the
    // cascading Korean drift bug Eddie hit on 2026-04-11.
    const userOnlyMessages = inputMessages.filter((m) => m.sender === "user")
    const forceKorean = validatedLocale !== "ko" && isPredominantlyKorean(userOnlyMessages)
    const streamFn = getStreamFn(provider)
    const systemPrompt = getSystemPrompt(provider, validatedLocale, validatedResponseLength, forceKorean)
    const maxTokens = getMaxTokens(validatedResponseLength)
    // Hard word caps per response length. These sit behind the prompt
    // instruction as a belt-and-suspenders guard: when a provider (Gemini
    // especially) decides to run 2x longer than requested, the server
    // clamps the stream mid-flight instead of letting the oversized
    // bubble dominate the debate feed.
    const wordLimit =
      validatedResponseLength === "short"
        ? 75
        : validatedResponseLength === "medium"
          ? 170
          : 320
    const encoder = new TextEncoder()
    let fullContent = ""
    // Whether any clampToWordLimit pass actually truncated the stream.
    // We only call polishTruncatedResponse when this is true, because
    // polishing can strip unmatched markdown pairs and trailing
    // connector words, which would unintentionally mutate normal
    // (non-truncated) responses in medium/long mode.
    let wasTruncated = false

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
            const limited = clampToWordLimit(nextContent, wordLimit)
            const nextChunk = limited.text.slice(fullContent.length)

            fullContent = limited.text
            if (!nextChunk) {
              if (limited.truncated) {
                wasTruncated = true
                abortProvider()
                break
              }
              continue
            }

            enqueueEvent({ chunk: nextChunk })

            if (limited.truncated) {
              wasTruncated = true
              abortProvider()
              break
            }
          }

          if (!request.signal?.aborted) {
            if (wasTruncated) {
              fullContent = polishTruncatedResponse(fullContent, wordLimit)
            }

            // Empty-stream guard: providers occasionally close the stream
            // without yielding any text (safety filter, transient model glitch).
            // streamGemini already retries once internally. Surface it as an
            // explicit empty flag so the client can show a clear fallback
            // instead of a placeholder stuck in "thinking..." forever.
            const isEmpty = !fullContent.trim()

            enqueueEvent({
              done: true,
              sender: provider,
              displayName: DISPLAY_NAMES[provider],
              content: fullContent,
              ...(isEmpty ? { empty: true } : {}),
            })
          }
          closeController()
        } catch (error) {
          if (request.signal?.aborted || (providerAbortController.signal.aborted && wasTruncated)) {
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
