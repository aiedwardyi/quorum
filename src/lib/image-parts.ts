/** Attached images for the panel: per-request caps, provider parts, text-only retry. */
import type { Message, MessageImage } from "@/types"
import { redactSecrets } from "@/lib/redact-secrets"

export const MODEL_IMAGE_SIDE = 1568
export const MODEL_IMAGE_QUALITY = 0.85
export const MAX_IMAGES_PER_REQUEST = 4
export const MAX_IMAGE_CHARS_PER_REQUEST = 3 * 1024 * 1024
const IMAGE_MIME = "image/jpeg" as const
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

export const THREAD_LEAD = "Here is the discussion so far:\n\n"
export const THREAD_TAIL = "\n\nPlease respond to the discussion above."

/** Model copy of an attached image, separate from OCR's larger one. */
export async function modelImage(file: File): Promise<MessageImage> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MODEL_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas 2D context unavailable")
  // JPEG has no alpha, so transparent icons would turn black.
  ctx.fillStyle = "#fff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return {
    name: file.name,
    data: canvas.toDataURL(IMAGE_MIME, MODEL_IMAGE_QUALITY).split(",")[1],
  }
}

function isMessageImage(image: unknown): image is MessageImage {
  const img = image as MessageImage | undefined
  return typeof img?.name === "string" && typeof img.data === "string" && BASE64.test(img.data)
}

export function hasImages(messages: Message[]): boolean {
  return messages.some((m) => m.images?.length)
}

export function stripImages(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (m.images === undefined) return m
    const rest = { ...m }
    delete rest.images
    return rest
  })
}

/** Newest valid user images within the request caps; the rest go text-only through their OCR text. */
export function capImages(messages: Message[]): Message[] {
  let count = 0
  let chars = 0
  const out = [...messages]
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i]
    if (m.images === undefined) continue
    const images = m.sender === "user" && Array.isArray(m.images) ? m.images : []
    const kept: MessageImage[] = []
    for (let j = images.length - 1; j >= 0; j--) {
      const image = images[j]
      if (!isMessageImage(image)) continue
      if (count >= MAX_IMAGES_PER_REQUEST) break
      if (chars + image.data.length > MAX_IMAGE_CHARS_PER_REQUEST) continue
      count++
      chars += image.data.length
      kept.unshift({ name: image.name, data: image.data })
    }
    const rest = { ...m }
    delete rest.images
    out[i] = kept.length ? { ...rest, images: kept } : rest
  }
  return out
}

export type ThreadPart = { text: string } | { image: MessageImage }

/** The packed `[Name]: content` thread, split after each message's images; text-only is one part. */
export function threadParts(messages: Message[], lead: string, tail: string): ThreadPart[] {
  const parts: ThreadPart[] = []
  let text = lead
  messages.forEach((m, i) => {
    text += `${i ? "\n\n" : ""}[${m.displayName}]: ${m.content}`
    if (!m.images?.length) return
    parts.push({ text })
    for (const image of m.images) parts.push({ image })
    text = ""
  })
  parts.push({ text: text + tail })
  return parts
}

export function claudeImage(image: MessageImage) {
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: IMAGE_MIME, data: image.data },
  }
}

export type OpenAiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" } }

/** GPT and Perplexity user content; a plain string when there are no images, as before. */
export function openAiContent(parts: ThreadPart[], detail?: "low"): string | OpenAiPart[] {
  if (parts.length === 1 && "text" in parts[0]) return parts[0].text
  return parts.map((p) =>
    "text" in p
      ? { type: "text", text: p.text }
      : {
          type: "image_url",
          image_url: {
            url: `data:${IMAGE_MIME};base64,${p.image.data}`,
            ...(detail && { detail }),
          },
        }
  )
}

export function geminiParts(
  parts: ThreadPart[]
): ({ text: string } | { inlineData: { mimeType: string; data: string } })[] {
  return parts.map((p) =>
    "text" in p ? { text: p.text } : { inlineData: { mimeType: IMAGE_MIME, data: p.image.data } }
  )
}

/** Redoes a seat text-only when its image request fails before any text arrives. */
export async function* withTextOnlyRetry(
  run: (messages: Message[]) => AsyncIterable<string>,
  messages: Message[],
  label: string,
  signal?: AbortSignal
): AsyncGenerator<string> {
  if (!hasImages(messages)) {
    yield* run(messages)
    return
  }
  let started = false
  try {
    for await (const chunk of run(messages)) {
      started = true
      yield chunk
    }
  } catch (err) {
    if (started || signal?.aborted) throw err
    const msg = redactSecrets(err instanceof Error ? err.message : String(err))
    console.warn(`[${label}] image request failed; retrying text-only:`, msg)
    yield* run(stripImages(messages))
  }
}
