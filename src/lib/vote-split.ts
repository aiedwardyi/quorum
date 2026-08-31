/** Failed/empty panelist rows must not count as votes or later-round answers. */
import type { Message, Provider } from "@/types"

const EMPTY_REPLY_EN = /couldn't reply this round\.?$/i
const EMPTY_REPLY_KO = /가 이번 라운드에 답하지 못했어요\.?$/
const TIMEOUT_PLACEHOLDER = /^(Gemini|Perplexity|Claude|GPT) timed out\.$/
const CANCELLED = /^Response cancelled\.?$/i
const CONFIG_START = /couldn't start:/i
const CONFIG_START_KO = /시작하지 못했어요/

export function isFailedPanelistRow(message: Message): boolean {
  if (message.sender === "user" || message.sender === "system" || message.sender === "verdict") {
    return false
  }
  if (message.failed) return true
  const content = message.content.trim()
  if (!content) return true
  return (
    EMPTY_REPLY_EN.test(content) ||
    EMPTY_REPLY_KO.test(content) ||
    TIMEOUT_PLACEHOLDER.test(content) ||
    CANCELLED.test(content) ||
    CONFIG_START.test(content) ||
    CONFIG_START_KO.test(content)
  )
}

/** AI rows after the latest user message (this turn), or the full list if none. */
export function messagesAfterLatestUser(messages: Message[]): Message[] {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === "user") {
      lastUser = i
      break
    }
  }
  return lastUser === -1 ? messages : messages.slice(lastUser + 1)
}

/** Distinct providers that produced a real reply this turn. */
export function countParticipatingModels(messages: Message[]): number {
  const senders = new Set<string>()
  for (const message of messagesAfterLatestUser(messages)) {
    if (message.sender === "user" || message.sender === "system" || message.sender === "verdict") {
      continue
    }
    if (isFailedPanelistRow(message)) continue
    senders.add(message.sender)
  }
  return senders.size
}

/** Keep panel order, drop anyone who empty-failed this user turn. */
export function providersWithReplies(messages: Message[], panel: Provider[]): Provider[] {
  const replied = new Set(
    messagesAfterLatestUser(messages)
      .filter((m) => !isFailedPanelistRow(m))
      .map((m) => m.sender)
  )
  return panel.filter((provider) => replied.has(provider))
}

/**
 * Rewrite LLM voteSplit so the denominator equals the number of models that
 * actually replied. "4/4 unanimous" with 3 replies becomes "3/3 unanimous".
 */
export function clampVoteSplit(voteSplit: string, repliedCount: number): string {
  if (!Number.isFinite(repliedCount) || repliedCount < 1) return voteSplit
  const match = voteSplit.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match || match.index === undefined) return voteSplit
  let num = Number(match[1])
  let den = Number(match[2])
  if (!Number.isFinite(num) || !Number.isFinite(den)) return voteSplit
  den = repliedCount
  if (num > den) num = den
  if (num < 0) num = 0
  return `${voteSplit.slice(0, match.index)}${num}/${den}${voteSplit.slice(match.index + match[0].length)}`
}
