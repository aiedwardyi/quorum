# 🏛️ Quorum — v1 Build Plan

> **Goal:** Working group chat — you + Gemini + Perplexity in one thread, consensus detection, done.

---

## ✅ Task 1: Provider Wrappers — COMPLETE

Simple functions that take a system prompt + messages and return a string.

- [x] `src/lib/providers/gemini.ts` — Vertex AI SDK wrapper (gemini-2.5-flash)
- [x] `src/lib/providers/perplexity.ts` — REST API wrapper (sonar-pro)
- [x] Test both with a simple "Hello" call
- [x] Each provider independent — one failing doesn't break the other

**Done when:** Both providers return a response to a test prompt. ✅

---

## ✅ Task 2: Chat API Route — COMPLETE

- [x] `POST /api/chat` — accepts message + full thread + selected model
- [x] Queries the selected model with full conversation context
- [x] Streams response back via SSE
- [x] Returns: sender, content, timestamp

**Done when:** Can hit the endpoint and get a streamed AI response. ✅

---

## ✅ Task 3: Consensus API Route — COMPLETE

- [x] `POST /api/consensus` — takes the full conversation thread
- [x] Asks Gemini to score agreement as JSON
- [x] Returns: `{ score, agreements, disagreements, summary }`
- [x] Score >= 80 means consensus reached
- [x] Sends thread as single user message (avoids Vertex AI role-alternation requirement)

**Done when:** Returns accurate consensus JSON for a sample conversation. ✅

---

## ✅ Task 4: Chat UI Components — COMPLETE

| Component | What It Does |
|-----------|-------------|
| `ChatBubble.tsx` | Colored message bubble — sender name, timestamp, model color |
| `ChatThread.tsx` | Scrolling list of bubbles, auto-scroll to bottom |
| `MessageInput.tsx` | Text input + send + "Next" model dropdown + stop button |
| `ConsensusMeter.tsx` | Progress bar showing agreement % |
| `ModelSelector.tsx` | Toggle badges for Gemini / Perplexity |
| `SummaryCard.tsx` | Final verdict card when consensus reached or stopped |

**Done when:** All components render correctly with mock data. ✅

---

## ✅ Task 5: Wire It All Together — COMPLETE

- [x] `src/app/chat/page.tsx` — main group chat room with useReducer state
- [x] User sends message → models respond via SSE streaming → round-robin turns
- [x] Turn order: round-robin (default) or popcorn (pick who speaks via dropdown)
- [x] Consensus check runs after each full round
- [x] Stop button ends debate and generates summary
- [x] Typing indicator while model generates
- [x] Perplexity role-alternation fix (pack thread into single user message)
- [x] Per-model system prompt with identity awareness
- [x] Citation/reference stripping via cleanResponse utility

**Done when:** Full conversation loop works end-to-end. ✅

**Known bugs (logged in Bug_Registry):** BUG-001 through BUG-008 — partial fixes applied, remaining bugs deferred to polish pass.

---

## ✅ Task 6: Home Page — COMPLETE

- [x] Big textarea: *"What do you need consensus on?"*
- [x] "Start Discussion" button → navigates to `/chat` with the prompt
- [x] Clean, minimal design with fade-in animation
- [x] Prompt passed via sessionStorage (clean URL, no query params)
- [x] `/chat` page reads sessionStorage on mount and auto-sends as first message
- [x] Cmd/Ctrl + Enter keyboard shortcut to submit

**Done when:** Can start a new discussion from the home page. ✅

---

## ✅ v1 Complete When

- [x] Can type a question and see Gemini + Perplexity discuss it
- [x] Can steer the conversation mid-debate
- [x] Consensus bar updates after each round
- [x] Summary card appears when consensus reached or stopped
- [x] Browser tab shows: **Quorum | AI Group Chat**

**🎉 v1 is COMPLETE — all 6 tasks done.**

---

## Known Issues for Polish Pass

- Gemini sometimes speaks in third person / prefixes with `[Gemini]:` — caused by `buildContents` formatting messages with `[DisplayName]:` prefix
- Consensus display is duplicated (sidebar meter + summary card) — should be ONE place
- Chat page UI needs font/color refresh
- Response length not configurable (models default to verbose)
