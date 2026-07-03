/** URL detection in messages and per-provider URL capability instructions. */
import type { Message, Provider } from "@/types"

const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/iu

function getLatestUserMessage(messages: Message[]): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sender === "user") return messages[i]
  }
  return null
}

export function stripExtractedFileBlocks(text: string): string {
  const markerIndex = text.indexOf("--- File:")
  return markerIndex === -1 ? text : text.slice(0, markerIndex)
}

export function hasDirectUrlReference(text: string): boolean {
  return URL_REGEX.test(stripExtractedFileBlocks(text))
}

export function latestUserMessageHasDirectUrl(messages: Message[]): boolean {
  const latestUserMessage = getLatestUserMessage(messages)
  if (!latestUserMessage) return false
  return hasDirectUrlReference(latestUserMessage.content)
}

export function getUrlCapabilityInstruction(provider: Provider): string {
  if (provider === "perplexity") {
    return "IMPORTANT: You MAY use web search and inspect public URLs when relevant. If a URL cannot be accessed or the evidence is unclear, say so plainly. Do NOT fabricate page contents."
  }

  return "IMPORTANT: You CANNOT access external URLs, links, or websites yourself. If the user includes a URL, never claim you opened or read it. Only analyze content already present in the conversation, such as pasted text, extracted file text, or another model's earlier summary."
}

export function prioritizePerplexity(models: Provider[]): Provider[] {
  if (!models.includes("perplexity")) return models
  return ["perplexity", ...models.filter((model) => model !== "perplexity")]
}
