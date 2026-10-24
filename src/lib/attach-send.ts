/** What Send does with the composer's text and attached files. */
import type { Locale, MessageImage } from "@/types"
import { IMAGE_EXTENSIONS, type ParseResult } from "@/lib/file-parser"
import { MAX_IMAGES_PER_REQUEST } from "@/lib/image-parts"

export interface ComposerFile {
  name: string
  parsing?: boolean
  ocrPending?: boolean
  parsed?: ParseResult
  image?: MessageImage
}

// Models still get the picture; the marker keeps text-only follow-ups honest.
export const NO_TEXT_IMAGE = "[Image with no readable text]"
// A bare header reads as a blank file to the models, so say where the text is.
export const TEXT_NOT_READ = "[Text not extracted; read it from the image]"
// How long Send waits for pending OCR, so fast sends keep exact words for the verdict.
export const OCR_GRACE_MS = 4000
// Creep target while OCR runs; stays short of 100 until the real result lands.
const CREEP_CEILING = 90
const CREEP_RATE = 0.1

export function isImageName(name: string): boolean {
  return IMAGE_EXTENSIONS.has(name.split(".").pop()?.toLowerCase() ?? "")
}

function fileText(f: ComposerFile): string {
  const text = f.parsed?.text ?? ""
  return text.startsWith("[Unsupported") ? "" : text
}

/** Images always count; other files only when they have text. */
export function isSendable(f: ComposerFile): boolean {
  if (f.parsing) return false
  return !!f.image || !!fileText(f)
}

export type TileState = "reading" | "ready" | "skipped"

export function tileState(f: ComposerFile): TileState {
  if (f.parsing) return "reading"
  return isSendable(f) ? "ready" : "skipped"
}

/** Message text and images for Send, or null when there is nothing to send. */
export function composeMessage(
  text: string,
  files: ComposerFile[]
): { text: string; images: MessageImage[] } | null {
  const blocks: string[] = []
  const images: MessageImage[] = []
  for (const f of files) {
    if (!isSendable(f)) continue
    const header = `--- File: ${f.name} ---`
    blocks.push(`${header}\n${f.ocrPending ? TEXT_NOT_READ : fileText(f) || NO_TEXT_IMAGE}`)
    if (f.image) images.push(f.image)
  }
  const typed = text.trim()
  if (!typed && blocks.length === 0) return null
  return { text: [typed, ...blocks].filter(Boolean).join("\n\n"), images }
}

/** Values of the promises that settle within `ms`; the rest stay undefined. */
export async function settleWithin<T>(
  pending: (Promise<T> | undefined)[],
  ms: number
): Promise<(T | undefined)[]> {
  const out: (T | undefined)[] = pending.map(() => undefined)
  const all = Promise.all(
    pending.map((p, i) =>
      p?.then(
        (v) => {
          out[i] = v
        },
        () => {}
      )
    )
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([all, new Promise((resolve) => (timer = setTimeout(resolve, ms)))])
  clearTimeout(timer)
  return [...out]
}

/** Attach waits only for the session; Send also waits for files still parsing and a send in flight. */
export function composerLocks(
  text: string,
  files: ComposerFile[],
  sessionLoading: boolean,
  sending = false
) {
  return {
    attachDisabled: sessionLoading,
    sendDisabled:
      sessionLoading || sending || files.some((f) => f.parsing) || !composeMessage(text, files),
  }
}

/** Incoming files within the per-message picture limit; `capped` when a picture was left out. */
export function capPictures(
  attached: ComposerFile[],
  incoming: File[]
): { files: File[]; capped: boolean } {
  let room =
    MAX_IMAGES_PER_REQUEST -
    attached.filter((f) => isImageName(f.name) && tileState(f) !== "skipped").length
  const files = incoming.filter((f) => !isImageName(f.name) || room-- > 0)
  return { files, capped: files.length < incoming.length }
}

const KO_STATUS: [RegExp, string][] = [
  [/^Reading image\.\.\.$/, "이미지 읽는 중..."],
  [/^Reading text\.\.\.$/, "텍스트 읽는 중..."],
  [/^Reading PDF\.\.\.$/, "PDF 읽는 중..."],
  [/^Preparing pages\.\.\.$/, "페이지 준비 중..."],
  [/^Fallback OCR\.\.\.$/, "보조 OCR 실행 중..."],
  [/^Done$/, "완료"],
  [/^Reading page (\d+\/\d+)$/, "$1 페이지 읽는 중"],
  [/^Preparing (\d+\/\d+)$/, "$1 페이지 준비 중"],
  [/^OCR page (\d+\/\d+)\.\.\.$/, "$1 페이지 OCR 중..."],
]

/** file-parser reports progress in English; the tile shows it in the UI language. */
export function localizeStatus(status: string, locale: Locale): string {
  if (locale !== "ko") return status
  const match = KO_STATUS.find(([re]) => re.test(status))
  return match ? status.replace(match[0], match[1]) : status
}

/** One tick of the reading ring while a request is in flight. */
export function creepProgress(progress: number): number {
  if (progress >= CREEP_CEILING) return progress
  return Math.min(CREEP_CEILING, progress + Math.max(0.5, (CREEP_CEILING - progress) * CREEP_RATE))
}
