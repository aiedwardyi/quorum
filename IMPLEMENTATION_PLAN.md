# 🏛️ Quorum — Implementation Plan

> Group chat where multiple AI models debate, then Quorum returns a decisive recommendation.

---

## 🎯 Overview

You ask a question. AIs take turns responding to the growing thread. You steer anytime. They converge on an answer.

**v1 Scope — and nothing more:**
- 2 models: Gemini (gemini-2.5-flash via Vertex AI) + Perplexity (sonar-pro via REST)
- Single chat thread (group chat, not side-by-side panels)
- User participates anytime
- Round-robin or popcorn turn order
- Consensus detection via single API call per round
- No database, no auth, no i18n — local tool, English only, in-memory

---

## 🛠️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Framework | Next.js 14+, TypeScript, App Router | Full-stack React in one project |
| Styling | Tailwind CSS + shadcn/ui | Clean defaults, fast iteration |
| AI | @google-cloud/vertexai, Perplexity REST | Credits available, diverse perspectives |
| State | React useState / useReducer | Simple — no state library needed for v1 |
| Streaming | Server-Sent Events (SSE) | Simpler than WebSockets for AI streaming |
| Database | None | In-memory only for v1 |
| GCP Auth | Application Default Credentials | `gcloud auth` — no service account JSON needed |

---

## 📁 File Structure
```
src/
├── app/
│   ├── page.tsx                  # Home — start new chat
│   ├── chat/
│   │   └── page.tsx              # Group chat room
│   └── api/
│       ├── chat/route.ts         # Send message, get AI response (SSE)
│       └── consensus/route.ts    # Check agreement score
├── components/
│   ├── ChatThread.tsx            # Scrolling message list
│   ├── ChatBubble.tsx            # Single message bubble
│   ├── ModelSelector.tsx         # Toggle models on/off
│   ├── ConsensusMeter.tsx        # Agreement progress bar
│   ├── MessageInput.tsx          # Text input + controls
│   └── SummaryCard.tsx           # Final verdict card
├── lib/
│   ├── providers/
│   │   ├── gemini.ts             # Vertex AI SDK wrapper
│   │   └── perplexity.ts         # REST API wrapper
│   └── orchestrator.ts           # Turn order + thread management
└── types.ts                      # Shared TypeScript types
```

---

## 📝 Types
```typescript
type Provider = "gemini" | "perplexity"

type Message = {
  id: string
  sender: Provider | "user"
  displayName: string
  content: string
  timestamp: Date
}

type ConsensusResult = {
  winner: string
  voteSplit: string
  confidence: number
  reasons: string[]
  minorityView: string
  oppositeCase: string
  modelAgreement?: number
}

type ChatState = {
  messages: Message[]
  activeModels: Provider[]
  consensus: ConsensusResult | null
  isDebating: boolean
  currentRound: number
  estimatedCost: number
}
```

---

## 💬 System Prompt

Sent to each AI model on every turn:
```
You are in a group discussion with other AI models and a human user.
The human is the decision-maker. Respond to the full conversation
naturally. If you disagree with another model, say so directly and
explain why. If you changed your mind based on new points, say that too.
Be concise — keep responses under 200 words. This is a discussion,
not an essay.
```

---

## 📊 Final Verdict Generation

Keep it simple — one moderator/final-verdict API call after each full round:

1. Send full conversation thread to Gemini
2. Prompt: *"Decide which answer wins, explain why, and return JSON only."*
3. Expected response:
```json
{
  "winner": "Start with a monolith",
  "voteSplit": "4/4",
  "confidence": 87,
  "reasons": [
    "Faster to ship",
    "Lower operational complexity",
    "No immediate scaling bottleneck"
  ],
  "minorityView": "Split earlier if independent teams must deploy separately from day one.",
  "oppositeCase": "Microservices are better when strict isolation or separate scaling is already a hard requirement.",
  "modelAgreement": 91
}
```
4. Show the decisive verdict card after the debate completes
5. If needed, keep `modelAgreement` as a secondary metric only

No embeddings. No cosine similarity. No multi-layer scoring. Just one clean API call.

---

## 🔄 Conversation Flow

1. User posts a message (question or steering comment)
2. Selected model responds (or round-robin if "All")
3. Next model sees the **full thread** and responds to it
4. Models take turns responding to the growing conversation
5. After each full round → run consensus check
6. User can post anytime — their message becomes part of the thread
7. When consensus >= 80% or user clicks Stop → generate summary

**Turn order options:**
- **Round robin** — each model takes a turn in order (default)
- **Popcorn** — user picks who speaks next via dropdown

---

## 🎨 Model Colors

| Model | Color | Hex | Status |
|-------|-------|-----|--------|
| Gemini | 🔵 Blue | `#3B82F6` | v1 |
| Perplexity | 🟢 Teal | `#14B8A6` | v1 |
| Claude | 🟠 Orange | `#F97316` | v2 |
| GPT | 🟢 Green | `#22C55E` | v2 |
| User | ⚪ Neutral | — | v1 |

---

## ⚠️ Key Rules

- **Server-side only** — all API calls through Next.js API routes, keys never in browser
- **Full context** — send entire conversation thread to each model every turn
- **Max 5 rounds** — prevents infinite loops and runaway costs
- **Graceful failure** — one model failing doesn't break the other
- **Auto-scroll** — chat scrolls to bottom on new messages
- **Typing indicator** — show animation while model is generating
- **ADC auth** — Vertex AI uses `gcloud auth application-default login`, no JSON key files
- **Less is more** — lightweight, minimal, user knows what to do on page load
- **No duplicate info** — consensus display in ONE place, not sidebar + summary card
- **Non-technical friendly** — subscription/token model preferred over raw API key input

---

## 📌 v1 Status: COMPLETE

All 6 tasks done. Full loop working: home page → chat → debate → streaming → consensus → summary.

**Known issues for v2 polish:**
- Gemini third-person speech (buildContents `[Name]:` prefix causes mimicry)
- Consensus display duplicated in sidebar + summary card
- Chat page UI needs font/color refresh
- Home page needs redesign (new font, remove hardcoded model badges)
- Response length not configurable

---

## 🔮 v2 Planning Notes

**New models:** Claude (Anthropic SDK) + GPT (OpenAI SDK) — up to 4 models, user selects

**User-facing controls (chat page):**
- Response length: short / medium / long-descriptive
- Round count: configurable
- Model picker: choose which AIs participate

**Document upload use case:**
- User uploads a provisional patent PDF
- AIs analyze, suggest edits, debate until consensus on best version
- Export final edited patent as PDF

**Monetization foundation:**
- Token/credit tracking system
- Subscription model: flat monthly fee → token pool across all models
- Server-side API key storage (encrypted, user doesn't re-enter)
- User accounts for persistence

**Design philosophy:**
- Less is more — resist over-building
- Good customization with clean UI, never cluttered
- Theme options: light / dark / sepia / custom
