export type Provider = "gemini" | "perplexity" | "claude" | "gpt"

export type Locale = "en" | "ko"

export type ResponseLength = "short" | "medium" | "long"

export const THEMES = ["light", "dark", "tokyonight", "lovelace", "gruvbox", "catppuccin", "nord"] as const
export type Theme = (typeof THEMES)[number]

export type Message = {
  id: string
  sender: Provider | "user" | "system"
  displayName: string
  content: string
  timestamp: Date
}

export type ConsensusResult = {
  score: number
  agreements: string[]
  disagreements: string[]
  summary: string
}

export type ChatState = {
  messages: Message[]
  activeModels: Provider[]
  consensus: ConsensusResult | null
  isDebating: boolean
  currentRound: number
  estimatedCost: number
}
