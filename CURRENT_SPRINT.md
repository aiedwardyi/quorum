# Quorum - v1 Build Plan

## Goal
Working group chat: you + Gemini + Perplexity in one thread, consensus detection, done.

---

## Task 1: Provider Wrappers
Create simple functions that take a system prompt + messages and return a string.
- src/lib/providers/gemini.ts - Vertex AI SDK wrapper (gemini-2.5-flash)
- src/lib/providers/perplexity.ts - REST API wrapper (sonar-pro)
- Test both with a simple Hello call

## Task 2: Chat API Route
- POST /api/chat - accepts message + full thread + selected model
- Queries the selected model with full conversation context
- Streams response via SSE
- Returns sender, content, timestamp

## Task 3: Consensus API Route
- POST /api/consensus - takes full thread
- Asks Gemini to score agreement as JSON
- Returns { score, agreements, disagreements, summary }

## Task 4: Chat UI Components
- ChatBubble.tsx - colored message bubble (sender name, timestamp, model color)
- ChatThread.tsx - scrolling list of bubbles, auto-scroll to bottom
- MessageInput.tsx - text input + send button + Next model dropdown + stop button
- ConsensusMeter.tsx - progress bar showing agreement %
- ModelSelector.tsx - toggle badges for Gemini/Perplexity
- SummaryCard.tsx - final verdict when done

## Task 5: Wire It All Together
- chat/page.tsx - the main group chat room
- User sends message then selected model responds then next model sees full thread and responds
- Round-robin or popcorn turn order
- Consensus check after each full round
- Stop button generates summary
- Typing indicator while model generates

## Task 6: Home Page
- Big textarea: What do you need consensus on?
- Start Discussion button navigates to /chat with the prompt
- Clean, minimal design

---

## Done When
- [ ] Can type a question and see Gemini + Perplexity discuss it
- [ ] Can steer the conversation mid-debate
- [ ] Consensus bar updates after each round
- [ ] Summary card appears when consensus reached or stopped
- [ ] Browser tab: Quorum | AI Group Chat
