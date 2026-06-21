import { streamGemini } from "@/lib/providers/gemini"
import { streamPerplexity } from "@/lib/providers/perplexity"
import { streamClaude } from "@/lib/providers/claude"
import { streamGPT } from "@/lib/providers/gpt"
import { isPredominantlyKorean } from "@/lib/detect-language"
import { getUrlCapabilityInstruction } from "@/lib/url-access"
import { redactSecrets } from "@/lib/redact-secrets"
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
      return "Give a detailed response of around 400 words. Hard cap at 500 words, do not exceed."
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

/**
 * Walks from the end of a truncated response and drops lines that are
 * dangling markdown structure with no body: a heading that has no content
 * below it, a lone bullet or numbered marker, or a table row that was cut
 * mid-write (starts with `|` but doesn't close with `|`). Only used on
 * responses that the stream clamper actually truncated, so normal answers
 * are never touched.
 *
 * Exported for unit testing.
 */
export function stripDanglingStructure(text: string): string {
  const lines = text.split("\n")
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trimEnd()
    if (last === "") {
      lines.pop()
      continue
    }
    // Any heading at the absolute end of the response is dangling by
    // definition - a properly-followed heading would not be the last
    // non-blank line. Applies to both `### Title` (heading cut before
    // its body) and `### ` (marker alone).
    if (/^#{1,6}(?:\s.*)?$/.test(last)) {
      lines.pop()
      continue
    }
    // Lone list marker with nothing after it: `-`, `* `, `1.`, `2. `, etc.
    if (/^(?:[-*]|\d+\.)\s*$/.test(last)) {
      lines.pop()
      continue
    }
    // Truncated table row: line starts with `|` and EITHER does not close
    // with `|` (mid-cell cut) OR has fewer pipes than the pipe-line above
    // it (cut between cells, still has a trailing `|` but not enough
    // columns). Complete rows that match the column count of the row
    // above are left alone.
    if (/^\s*\|/.test(last)) {
      const endsWithPipe = /\|\s*$/.test(last)
      if (!endsWithPipe) {
        lines.pop()
        continue
      }
      if (lines.length >= 2) {
        const prev = lines[lines.length - 2].trimEnd()
        if (/^\s*\|/.test(prev)) {
          const lastPipes = (last.match(/\|/g) || []).length
          const prevPipes = (prev.match(/\|/g) || []).length
          if (lastPipes < prevPipes) {
            lines.pop()
            continue
          }
        }
      }
    }
    break
  }
  return lines.join("\n").trimEnd()
}

/**
 * Polishes a response that the word-limit clamper had to truncate mid-write.
 * Tries to end at the last complete sentence, strips dangling markdown
 * structure (headings/bullets/table rows with no body), removes unmatched
 * bold/italic/code markers, and appends an ellipsis if the result still
 * doesn't end cleanly. Only called when `wasTruncated` is true.
 *
 * Exported for unit testing.
 */
export function polishTruncatedResponse(text: string, wordLimit: number): string {
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
    const sentenceSafe = result
      .slice(0, (lastSentence.index ?? 0) + lastSentence[0].length)
      .trimEnd()
    // Accept if we keep at least 30% of the content (works for both EN and KO)
    if (sentenceSafe.length >= result.length * 0.3) {
      result = sentenceSafe
    }
  }

  result = stripUnmatchedPair(result, "**")
  result = stripUnmatchedPair(result, "__")
  result = stripUnmatchedPair(result, "`")
  result = result.replace(/[,:;\-–]\s*$/u, "").trimEnd()
  result = result
    .replace(
      /\s+(and|or|but|while|because|if|so|that|which|with|to|for|of|in|on|at|by|from)$/iu,
      ""
    )
    .trimEnd()

  // Drop dangling markdown structure (heading with no body, lone bullet,
  // half-written table row). Runs after the pair-strip so any markers the
  // pair-strip introduced also get a chance to get caught.
  result = stripDanglingStructure(result)

  if (!/[.!?。！？]$/u.test(result)) {
    result = `${result}...`
  }

  return clampToWordLimit(result, wordLimit).text
}

// Formatting guidance varies by length. Short stays plain prose so tight
// answers don't get cluttered with structure. Medium unlocks bullets and
// numbered lists when the content is naturally a list. Long unlocks ###
// and #### subheadings, GFM tables, and fenced code, but NOT # or ##
// (those would compete with the app's own UI headers). The guiding line
// in every tier: "structure is a tool, not decoration."
export function getFormattingInstruction(length: ResponseLength, isKorean: boolean): string {
  if (isKorean) {
    switch (length) {
      case "short":
        return `이것은 토론이지 논문이 아닙니다. 평문으로 작성하세요.
헤더(#, ##, ###, ####)나 가로줄(---)을 사용하지 마세요.
**굵은 글씨**는 전체 응답에서 최대 1개의 중요한 어구에만, 정말 도움이 될 때에만 사용하세요.`
      case "medium":
        return `이것은 토론이지 논문이 아닙니다. 기본은 평문이지만, 자연스럽게 목록이 되는 내용(비교, 단계, 여러 개별 요점)은 - 또는 번호 목록으로 정리해도 됩니다.
헤더(#, ##, ###, ####)나 가로줄(---)은 사용하지 마세요.
**굵은 글씨**는 전체 응답에서 2-3개의 핵심 어구에만 사용하세요. 문장 전체나 상투적인 단어를 굵게 하지 마세요.
구조는 도구이지 장식이 아닙니다. 평문이 더 명확할 때는 평문으로 쓰세요.`
      case "long":
        return `응답이 여러 개별 부분으로 나뉠 때 ### 또는 #### 소제목으로 구역을 나눠도 됩니다. 단, # 또는 ##는 사용하지 마세요 (앱의 UI 헤더와 충돌합니다).
자연스러운 목록은 - 또는 번호 목록으로, 비교는 GFM 표(| 헤더 | 헤더 |)로, 기술적 내용은 \`인라인 코드\` 또는 \`\`\`코드 블록\`\`\`으로 표현할 수 있습니다.
**굵은 글씨**는 핵심 용어를 강조할 때 사용하세요. 가로줄(---)과 각주는 여전히 금지입니다.
구조는 도구이지 장식이 아닙니다. 이해에 도움이 될 때만 사용하고, 평문이 더 명확하면 평문으로 쓰세요.`
    }
  }
  switch (length) {
    case "short":
      return `This is a discussion, not an essay. Write in plain prose.
Do NOT use headers (#, ##, ###, ####) or horizontal rules (---).
Use **bold** for at most 1 key phrase in the whole response, and only when it genuinely helps the reader scan.`
    case "medium":
      return `This is a discussion, not an essay. Default to plain prose, but when the answer is naturally a list - a comparison, a set of steps, several distinct points - you may use a - or numbered list.
Do NOT use headers (#, ##, ###, ####) or horizontal rules (---).
Use **bold** sparingly for 2-3 key phrases. Never bold whole sentences or generic filler.
Structure is a tool, not decoration. When plain prose is clearer, use prose.`
    case "long":
      return `When the response has several distinct parts, you MAY use ### or #### subheadings to section it. Do NOT use # or ## - those compete with the app's own UI headers.
You may use - or numbered lists for naturally list-shaped content, GFM tables (| col | col |) for side-by-side comparisons, and \`inline code\` or fenced \`\`\`code blocks\`\`\` for technical content.
Use **bold** for key terms. Horizontal rules (---) and footnotes are still forbidden.
Structure is a tool, not decoration. Use it when it aids comprehension of the specific answer, and skip it when prose is clearer.`
  }
}

function getSystemPrompt(
  provider: Provider,
  locale: Locale,
  responseLength: ResponseLength,
  forceKorean: boolean
): string {
  const lengthLine = getResponseLengthInstruction(responseLength)
  const isKorean = locale === "ko" || forceKorean
  const shortLimitBlock = responseLength === "short" ? `${lengthLine}\n\n` : ""
  const formattingBlock = getFormattingInstruction(responseLength, isKorean)

  return `${shortLimitBlock}${isKorean ? "CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in Korean (한국어). Every single word of your response - including names, technical terms, and explanations - must be written in Korean. Do NOT use any English words except for proper nouns that have no Korean equivalent. The user's document is in Korean and they expect a Korean response. If you respond in English, the response is wrong.\n\nDo NOT switch languages mid-response. Stay in Korean from first character to last.\n\n" : "CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in English. Every sentence, every bullet, every summary line must be in English. Do NOT insert Korean, Japanese, Chinese, or any other language anywhere in your response - not even for a 'key points' recap or a translated quote. If you see non-English text in prior AI responses, IGNORE their language choice and respond in English regardless. Do NOT switch languages mid-response. Stay in English from first character to last.\n\n"}You are ${DISPLAY_NAMES[provider]} in a group discussion with other AI models and a human user.
Your name is ${DISPLAY_NAMES[provider]}. Always speak as yourself in first person.
Do NOT introduce yourself or state your name. Jump straight into the topic.
NEVER speak as another model. NEVER prefix your response with any name like "[Gemini]:" or "[Claude]:".
The human is the decision-maker. Respond to the full conversation naturally.
If you disagree with another model, say so directly and explain why.
If you changed your mind based on new points, say that too.
${lengthLine}
${formattingBlock}
Do NOT include citations, references, footnotes, URLs, or source numbers like [1][2] in your response.
Do NOT add a "References" or "Refs" section. Just give your opinion directly.
${getUrlCapabilityInstruction(provider)} However, when the user's message includes document text (between "--- File:" markers), that content HAS ALREADY BEEN EXTRACTED and is part of the message - read and analyze it directly.
NEVER give a lazy one-sentence answer. Even in short mode, provide a substantive response with reasoning. "That depends" or "It varies" alone is not acceptable.
This platform delivers informational perspectives on consequential topics including medical, legal, financial, and personal-decision questions. Always provide a substantive informational answer from your viewpoint. A brief plain-language disclaimer is fine where genuinely warranted (e.g. "consult a licensed professional for your specific situation"), but DO NOT refuse to engage. A refusal like "I can't give medical advice" or "I'm not qualified to advise on legal matters" is not an acceptable response - the user came here precisely to hear your informational perspective alongside the other AI panelists, and refusing while the others answer makes you the weakest contributor in the debate.
Do NOT roleplay as the user or quote what the user said. Only respond as yourself.
Do NOT include a word count, character count, or any meta-annotation in your response. NEVER write "(62 words)", "(Word count: 75)", "(75단어)", or similar self-report of the response length.`
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
    const {
      messages,
      provider,
      locale = "en",
      responseLength = "medium",
    } = body as {
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
      return new Response(JSON.stringify({ error: "Missing messages or provider" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!VALID_PROVIDERS.includes(provider)) {
      return new Response(JSON.stringify({ error: `Invalid provider: ${provider}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const inputMessages = messages.filter((m) => m.sender !== "system" && m.sender !== "verdict")
    // CRITICAL: only consider the USER's own messages when detecting the
    // conversation language. Otherwise one AI that hallucinates a Korean
    // summary mid-response tips the ratio and forces every subsequent
    // provider in the debate to respond entirely in Korean - the
    // cascading Korean drift bug observed on 2026-04-11.
    const userOnlyMessages = inputMessages.filter((m) => m.sender === "user")
    const forceKorean = validatedLocale !== "ko" && isPredominantlyKorean(userOnlyMessages)
    const streamFn = getStreamFn(provider)
    const systemPrompt = getSystemPrompt(
      provider,
      validatedLocale,
      validatedResponseLength,
      forceKorean
    )
    const maxTokens = getMaxTokens(validatedResponseLength)
    let userApiKey: string | undefined
    const { auth } = await import("@/lib/auth")
    const session = await auth()
    if (session?.user?.id) {
      try {
        const { getUserProviderApiKey } = await import("@/lib/user-api-keys")
        userApiKey = await getUserProviderApiKey(session.user.id, provider)
      } catch (error) {
        const msg = error instanceof Error ? redactSecrets(error.message) : "Unknown error"
        console.error(`[chat/${provider}] failed to load user API key:`, msg)
      }
    }
    // Hard word caps per response length. These sit behind the prompt
    // instruction as a belt-and-suspenders guard: when a provider (Gemini
    // especially) decides to run 2x longer than requested, the server
    // clamps the stream mid-flight instead of letting the oversized
    // bubble dominate the debate feed.
    const wordLimit =
      validatedResponseLength === "short" ? 75 : validatedResponseLength === "medium" ? 170 : 500
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
          for await (const chunk of streamFn(
            systemPrompt,
            inputMessages,
            providerSignal,
            maxTokens,
            userApiKey
          )) {
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
          // Route provider failures through the `error` channel rather
          // than streaming them as bubble content. The old path wrote
          // `${DISPLAY_NAMES[provider]} encountered an error: ${raw}`
          // into a chat chunk, so upstream garbage like
          // "[VertexAI.ClientError]: got status: 499 Client Closed
          // Request. {"error":{"code":499,..}}" leaked verbatim into
          // the user-visible bubble. On the client side, data.error
          // throws into callModel's catch, which now substitutes the
          // friendly "stepped out for a snack break" system message.
          // The raw detail still lands in the server log for debugging.
          const msg = error instanceof Error ? error.message : "Unknown error"
          const sanitized = redactSecrets(msg)
          console.error(`[chat/${provider}] stream failed:`, sanitized)
          enqueueEvent({ error: sanitized })
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
