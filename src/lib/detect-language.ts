/** Detects whether a message set is predominantly Korean for locale-forcing. */
import type { Message } from "@/types"
import { stripExtractedFileBlocks } from "@/lib/url-access"

// Enough typed letters to tell the user's own language: "translate" and "번역해줘" both pass.
const MIN_TYPED_LETTERS = 4

function countScripts(text: string): { koreanChars: number; latinChars: number } {
  let koreanChars = 0
  let latinChars = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3130 && code <= 0x318f)
    ) {
      koreanChars++
    } else if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) {
      latinChars++
    }
  }
  return { koreanChars, latinChars }
}

/**
 * Detects whether a set of messages is predominantly Korean.
 *
 * Counts Hangul syllables (가-힣), Hangul Jamo (ㄱ-ㅎ, ㅏ-ㅣ, U+1100-U+11FF),
 * and Hangul Compatibility Jamo (U+3130-U+318F), then compares to Latin
 * letters. The user's typed text decides when it has a few letters, so
 * "translate this" on a Korean document gets an English reply. Attached
 * document text decides only when nothing was typed, at a 15% Korean ratio.
 *
 * Used by /api/chat and /api/consensus so the AI responses and the verdict
 * stay in the user's language even when the UI locale is English.
 */
export function isPredominantlyKorean(messages: Pick<Message, "content">[]): boolean {
  const contents = messages.map((m) => m.content ?? "")
  const typed = countScripts(contents.map(stripExtractedFileBlocks).join(" "))
  const { koreanChars, latinChars } =
    typed.koreanChars + typed.latinChars >= MIN_TYPED_LETTERS
      ? typed
      : countScripts(contents.join(" "))

  const total = koreanChars + latinChars
  if (total < 50) return koreanChars > latinChars
  return koreanChars / total >= 0.15
}
