import { NextRequest, NextResponse } from "next/server"
import {
  GEMINI_MODEL,
  GEMINI_NO_THINKING,
  createVertexAI,
  generateGoogleAiContentWithApiKey,
  geminiUsage,
  getConfiguredGeminiApiKey,
} from "@/lib/providers/gemini"
import { logHostUsage, type UsageSink } from "@/lib/host-cost"
import { resolveUserProviderApiKey } from "@/lib/server-provider-keys"
import { redactSecrets } from "@/lib/redact-secrets"

/**
 * Strip LLM OCR repetition loops where the model gets stuck on a token/phrase
 * (common failure mode on dense Korean text with low-confidence regions).
 * Collapses 4+ consecutive identical short tokens to a single instance.
 *
 * Example: "만천하에 만천하에 만천하에 만천하에 만천하에" -> "만천하에"
 */
function sanitizeOcrText(text: string): string {
  if (!text) return text
  // 1-30 char token followed by 3+ whitespace-separated repetitions of itself.
  // Use word-boundary-ish matching by anchoring on \S+.
  let cleaned = text.replace(/(\S{1,30})((?:\s+\1){3,})/g, "$1")
  // Also catch 2-3 word phrases stuck in a loop (e.g., "page 1 page 1 page 1").
  cleaned = cleaned.replace(/(\S{1,30}\s\S{1,30})((?:\s+\1){3,})/g, "$1")
  return cleaned
}

function getModel() {
  return createVertexAI().getGenerativeModel({ model: GEMINI_MODEL })
}

const OCR_PROMPT = `You are an OCR engine. Extract EVERY character of text from these document page images verbatim, including text rendered as part of posters, price tables, schedules, charts, signs, and any other visual elements.

ABSOLUTE RULES:
1. Output ONLY the raw text from the document. Nothing else.
2. NO preamble. NO "The following is a transcription". NO "Here is the text". NO "Page 1:". NO commentary of any kind.
3. NO suffix. NO closing remark. NO summary. NO explanation.
4. Do NOT invent or hallucinate text that is not actually visible in the image. If a section is blank, leave it blank.
5. Preserve the original language exactly (Korean stays Korean, English stays English). NEVER translate.
6. Include every word, number, date, name, legal citation, article number, signature, stamp text, and page header/footer exactly as written.
7. Preserve line breaks and paragraph structure. Keep numbered lists, bullet points, and indentation where visible.
8. For Korean legal documents: capture 소장, 준비서면, 원고, 피고, 갑 제X호증, 사건번호, article references, and Korean proper nouns with full fidelity.
9. If a character is unclear, make your best guess based on context - do NOT write "[illegible]" or skip content.
10. Separate each page's content with a single blank line.

Your output must start with the first character of actual document text, and end with the last character of actual document text. Anything else is a failure.`

export async function POST(req: NextRequest) {
  try {
    const { images, userApiKey, accessCode } = (await req.json()) as {
      images: string[]
      userApiKey?: string
      accessCode?: string
    }

    const MAX_OCR_PAGES = 20
    if (!Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 })
    }
    if (images.length > MAX_OCR_PAGES) {
      return NextResponse.json({ error: "Too many images" }, { status: 400 })
    }
    if (!images.every((img) => typeof img === "string" && img.length > 0)) {
      return NextResponse.json({ error: "Invalid images" }, { status: 400 })
    }

    const { userApiKey: userGeminiApiKey, blockedResponse } = await resolveUserProviderApiKey(
      "gemini",
      "ocr",
      typeof userApiKey === "string" ? userApiKey : undefined,
      typeof accessCode === "string" ? accessCode : undefined,
      { units: images.length }
    )
    if (blockedResponse) return blockedResponse

    const parts = images.flatMap((base64, i) => [
      { text: `--- Page ${i + 1} ---` },
      {
        inlineData: {
          mimeType: "image/png" as const,
          data: base64,
        },
      },
    ])

    const onUsage: UsageSink | undefined = userGeminiApiKey
      ? undefined
      : (usage) => logHostUsage("gemini", usage)
    const apiKey = userGeminiApiKey || getConfiguredGeminiApiKey()
    const rawText = apiKey
      ? await generateGoogleAiContentWithApiKey({
          apiKey,
          modelName: GEMINI_MODEL,
          contents: [{ role: "user", parts: [{ text: OCR_PROMPT }, ...parts] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 8192,
            ...GEMINI_NO_THINKING,
          },
          onUsage,
        })
      : await (() => {
          const model = getModel()
          return model
            .generateContent({
              contents: [
                {
                  role: "user",
                  parts: [{ text: OCR_PROMPT }, ...parts],
                },
              ],
              generationConfig: {
                temperature: 0,
                maxOutputTokens: 8192,
                ...GEMINI_NO_THINKING,
              },
            })
            .then((result) => {
              const usage = geminiUsage(result.response.usageMetadata)
              if (usage) onUsage?.(usage)
              return (result.response.candidates?.[0]?.content?.parts ?? [])
                .map((part) => part.text ?? "")
                .join("")
            })
        })()
    const text = sanitizeOcrText(rawText)

    return NextResponse.json({ text })
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : "Unknown error")
    console.error("[ocr] Failed:", message)
    return NextResponse.json(
      {
        error: "OCR failed",
        details: message,
      },
      { status: 500 }
    )
  }
}
