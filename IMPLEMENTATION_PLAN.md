# Quorum - Implementation Plan

## Overview
Group chat where multiple AI models discuss alongside you. You ask a question, AIs take turns responding to the growing thread, you steer anytime, they converge on an answer.

## v1 Scope
- 2 models: Gemini (gemini-2.5-flash via Vertex AI) + Perplexity (sonar-pro via REST)
- Single chat thread (group chat style)
- User participates anytime
- Round-robin or popcorn turn order
- Consensus detection via single API call per round
- No database, no auth, no i18n - local tool, English only, in-memory

## Tech Stack
| Layer | Tech |
|-------|------|
| Framework | Next.js 14+, TypeScript, App Router |
| Styling | Tailwind CSS + shadcn/ui |
| AI | @google-cloud/vertexai (Gemini), Perplexity REST API |
| State | React useState/useReducer |
| Streaming | Server-Sent Events (SSE) |
| Database | None (v1) |
| Auth | gcloud auth application-default login (ADC) |

## File Structure
src/
  app/
    page.tsx                 # Home - start new chat
    chat/
      page.tsx               # Group chat room
    api/
      chat/route.ts          # Send message, get AI response (SSE)
      consensus/route.ts     # Check agreement score
  components/
    ChatThread.tsx
    ChatBubble.tsx
    ModelSelector.tsx
    ConsensusMeter.tsx
    MessageInput.tsx
    SummaryCard.tsx
  lib/
    providers/
      gemini.ts
      perplexity.ts
    orchestrator.ts
  types.ts

## Types
Provider = "gemini" | "perplexity"

Message = {
  id: string
  sender: Provider | "user"
  displayName: string
  content: string
  timestamp: Date
}

ConsensusResult = {
  score: number
  agreements: string[]
  disagreements: string[]
  summary: string
}

ChatState = {
  messages: Message[]
  activeModels: Provider[]
  consensus: ConsensusResult | null
  isDebating: boolean
  currentRound: number
  estimatedCost: number
}

## System Prompt (sent to each AI)
You are in a group discussion with other AI models and a human user.
The human is the decision-maker. Respond to the full conversation
naturally. If you disagree with another model, say so directly and
explain why. If you changed your mind based on new points, say that too.
Be concise - keep responses under 200 words. This is a discussion,
not an essay.

## Consensus Detection
After each full round, one API call:
- Send full thread to Gemini with: Analyze this discussion. Return JSON only.
- Response: { score: 0-100, agreements: [], disagreements: [], summary: "" }
- If score >= 80 show consensus card

## Key Rules
- All API calls server-side (API routes) - keys never in browser
- Send full conversation thread to each model every turn
- Max 5 rounds default - prevents runaway costs
- Auto-scroll chat to bottom on new messages
- Show typing indicator while generating
- One model failing does not break the other
- Vertex AI uses Application Default Credentials (gcloud auth) not service account JSON

## Model Colors
- Gemini: Blue (#3B82F6)
- Perplexity: Teal (#14B8A6)
- Claude: Orange (#F97316) - v2
- GPT: Green (#22C55E) - v2
- User: neutral/white
