import type { Message, Provider } from "@/types"

export type VerdictAnswer = { id: string; provider: Provider; displayName: string }

/** Each verdict's answers: the latest non-empty one per AI since the previous verdict. */
export function answersByVerdict(messages: Message[]): Map<string, VerdictAnswer[]> {
  const byVerdict = new Map<string, VerdictAnswer[]>()
  let latest = new Map<Provider, { at: number; answer: VerdictAnswer }>()
  messages.forEach((m, at) => {
    if (m.sender === "verdict") {
      byVerdict.set(
        m.id,
        [...latest.values()].sort((a, b) => a.at - b.at).map((v) => v.answer)
      )
      latest = new Map()
    } else if (m.sender !== "user" && m.sender !== "system" && !m.failed && m.content.trim()) {
      latest.set(m.sender, {
        at,
        answer: { id: m.id, provider: m.sender, displayName: m.displayName },
      })
    }
  })
  return byVerdict
}
