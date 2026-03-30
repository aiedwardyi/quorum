export type Provider = "gemini" | "perplexity" | "claude" | "gpt"

export type Locale = "en" | "ko"

export type ResponseLength = "short" | "medium" | "long"

export type Theme = "light" | "dark" | "tokyonight" | "lovelace" | "gruvbox" | "catppuccin" | "nord"

export type Message = {
  id: string
  sender: Provider | "user"
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
