# 🏛️ Quorum — v1 Build Plan

> **Goal:** Working group chat — you + Gemini + Perplexity in one thread, consensus detection, done.

---

## 📦 Task 1: Provider Wrappers

Simple functions that take a system prompt + messages and return a string.

- `src/lib/providers/gemini.ts` — Vertex AI SDK wrapper (gemini-2.5-flash)
- `src/lib/providers/perplexity.ts` — REST API wrapper (sonar-pro)
- Test both with a simple "Hello" call
- Each provider independent — one failing doesn't break the other

**Done when:** Both providers return a response to a test prompt.

---

## 🔌 Task 2: Chat API Route

- `POST /api/chat` — accepts message + full thread + selected model
- Queries the selected model with full conversation context
- Streams response back via SSE
- Returns: sender, content, timestamp

**Done when:** Can hit the endpoint and get a streamed AI response.

---

## 📊 Task 3: Consensus API Route

- `POST /api/consensus` — takes the full conversation thread
- Asks Gemini to score agreement as JSON
- Returns: `{ score, agreements, disagreements, summary }`
- Score >= 80 means consensus reached

**Done when:** Returns accurate consensus JSON for a sample conversation.

---

## 🎨 Task 4: Chat UI Components

| Component | What It Does |
|-----------|-------------|
| `ChatBubble.tsx` | Colored message bubble — sender name, timestamp, model color |
| `ChatThread.tsx` | Scrolling list of bubbles, auto-scroll to bottom |
| `MessageInput.tsx` | Text input + send + "Next" model dropdown + stop button |
| `ConsensusMeter.tsx` | Progress bar showing agreement % |
| `ModelSelector.tsx` | Toggle badges for Gemini / Perplexity |
| `SummaryCard.tsx` | Final verdict card when consensus reached or stopped |

**Done when:** All components render correctly with mock data.

---

## 🔗 Task 5: Wire It All Together

- `chat/page.tsx` — the main group chat room
- User sends message → model responds → next model sees full thread → responds
- Turn order: round-robin (default) or popcorn (pick who speaks)
- Consensus check runs after each full round
- Stop button ends debate and generates summary
- Typing indicator while model generates

**Done when:** Full conversation loop works end-to-end.

---

## 🏠 Task 6: Home Page

- Big textarea: *"What do you need consensus on?"*
- "Start Discussion" button → navigates to `/chat` with the prompt
- Clean, minimal, premium feel

**Done when:** Can start a new discussion from the home page.

---

## ✅ v1 Complete When

- [ ] Can type a question and see Gemini + Perplexity discuss it
- [ ] Can steer the conversation mid-debate
- [ ] Consensus bar updates after each round
- [ ] Summary card appears when consensus reached or stopped
- [ ] Browser tab shows: **Quorum | AI Group Chat**
