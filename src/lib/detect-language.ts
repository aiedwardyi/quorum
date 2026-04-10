import type { Message } from "@/types"

/**
 * Detects whether a set of messages is predominantly Korean.
 *
 * Counts Hangul syllables (가-힣), Hangul Jamo (ㄱ-ㅎ, ㅏ-ㅣ, U+1100-U+11FF),
 * and Hangul Compatibility Jamo (U+3130-U+318F), then compares to Latin
 * letters. We force Korean responses when the ratio is >= 15% to catch the
 * common case of a short English question paired with a long Korean document.
 *
 * Used by /api/chat and /api/consensus so the AI responses and the verdict
 * stay in the document's language even when the UI locale is English.
 */
export function isPredominantlyKorean(messages: Pick<Message, "content">[]): boolean {
  const text = messages.map((m) => m.content ?? "").join(" ")
  if (!text) return false

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
    } else if (
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      latinChars++
    }
  }

  const total = koreanChars + latinChars
  if (total < 50) return koreanChars > latinChars
  return koreanChars / total >= 0.15
}
