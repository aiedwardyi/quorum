export type Provider = "gemini" | "perplexity"

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
