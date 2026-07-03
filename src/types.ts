export type Provider = "gemini" | "perplexity" | "claude" | "gpt"

// Providers a user can supply their own API key for. Lives here (dependency-free)
// so both server (user-api-keys) and client (client-api-keys) can share it without
// the client bundle pulling in crypto/prisma.
export const USER_API_KEY_PROVIDERS = [
  "gemini",
  "perplexity",
  "claude",
  "gpt",
] as const satisfies readonly Provider[]

export type Locale = "en" | "ko"

export type ResponseLength = "short" | "medium" | "long"

export const THEMES = [
  "light",
  "solarized",
  "dark",
  "tokyonight",
  "lovelace",
  "gruvbox",
  "catppuccin",
  "nord",
] as const
export type Theme = (typeof THEMES)[number]

export type Message = {
  id: string
  sender: Provider | "user" | "system" | "verdict"
  displayName: string
  content: string
  timestamp: Date
  verdictData?: VerdictResult
}

export type VerdictResult = {
  recommendedAnswer: string
  voteSplit: string
  confidence: number
  reasons: string[]
  minorityView: string
  oppositeCase: string
  modelAgreement?: number
  analysis?: string
  keyTakeaways?: string[]
  actionItems?: string[]
}

export type ChatState = {
  messages: Message[]
  activeModels: Provider[]
  verdict: VerdictResult | null
  isDebating: boolean
  currentRound: number
  estimatedCost: number
}

export type ThreadSummary = {
  id: string
  title: string
  models: string[]
  status: "active" | "complete"
  updatedAt: string
  verdicts: {
    recommendation: string
    confidence: number
  }[]
}
