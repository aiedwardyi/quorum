# 🏛️ Quorum — Roadmap

> Multi-AI decision assistant powered by model debate

---

## Product Direction

Quorum is moving away from a neutral "consensus recap" and toward a decision-oriented workflow:

- models debate in the background
- the final card gives a recommended answer first
- users can see vote split, reasons, and minority view
- users can continue the same thread after verdict
- logged-in users can reopen saved threads later

## ✅ v1: Working Group Chat *(Complete)*

The core experience — a group chat where you + Gemini + Perplexity discuss a topic together.

- [x] Project scaffolding (Next.js + Tailwind + shadcn/ui)
- [x] Gemini + Perplexity provider wrappers
- [x] Chat API route (SSE streaming)
- [x] Consensus scoring API route
- [x] Chat UI — thread, bubbles, input bar, model selector
- [x] Consensus meter + summary card
- [x] Wire end-to-end flow
- [x] Home page with prompt input

**Status:** ✅ Complete — all 6 tasks done. Full loop working: home → chat → debate → consensus.

---

## 📋 v2: Decisive Verdict + Continue Thread + Persistence Foundation

Make the ending state decisive and make debates reusable.

- [x] Add Claude (Anthropic SDK) + GPT (OpenAI SDK) provider integrations
- [ ] Replace neutral summary schema with decision-oriented verdict schema:
  - `winner`
  - `voteSplit`
  - `confidence`
  - `reasons`
  - `minorityView`
  - `oppositeCase`
- [x] Model selection UI — users choose which AIs participate (up to 4)
- [x] Response length control (short / medium / long) — UI + API wired with word targets
- [x] Configurable round count (3 / 5 / 7) — wired end-to-end, homepage -> settings -> debate loop
- [x] Deduplicate consensus display — ONE location, not sidebar + summary card
- [x] Fix Gemini third-person / name-prefix bug (BUG-009 — buildContents formatting)
- [x] Home page redesign — v2 with model selector, dark mode, i18n, rainbow border
- [x] Chat page UI refresh — v2 components ported, wired to v1 streaming logic
- [x] Premium summary/final verdict polish — higher-contrast summary card, final verdict eyebrow, stronger dark-mode presentation
- [x] Homepage -> chat page config passthrough (sessionStorage, all settings carry over)
- [x] Consensus bar real-time updates (fills after each round)
- [x] Smart auto-scroll + scroll-to-bottom button
- [x] Thinking indicator with colored model icons (merged into ChatBubble)
- [x] Wire response length to system prompt (short ~75w, medium ~150w, long ~300w)
- [x] i18n for AI-generated content — locale passed to system prompts for chat + consensus API
- [ ] Between-round status feedback (brief "analyzing..." bubble)
- [ ] Round divider labels in chat thread ("ROUND 1", "ROUND 2" visual separators)
- [x] Stop button stuck state fix (BUG-012)
- [ ] API error graceful handling (rate limits, quota)
- [ ] Continue discussion from completed verdict (follow-up in same thread)
- [ ] Session persistence foundation
- [ ] Chat history page
- [ ] **BUG-013**: Round selection display — picking 3 rounds still shows "5/3" in header
- [ ] **BUG-014**: AI models fake-read pasted URLs/GitHub links — need actual URL fetching or honest refusal
- [ ] **BUG-015**: Document upload UI attaches files but content not sent to AI models — fix API payload
- [ ] Document/media upload (PDF analysis use case)
- [ ] Share verdict via link (public read-only snapshot page, no full transcript)
- [ ] Export conversation as markdown/PDF

---

## 🎨 v3: Accounts + Saved Work + Decision UX Polish

Make saved work, identity, and recommendation UX feel complete.

- [ ] User login modal with Google OAuth
- [ ] User accounts (persist settings, keys, history)
- [ ] Saved thread sidebar / history browser
- [ ] Follow-up question shortcuts from verdict card
- [ ] Korean / English i18n polish for decision-oriented verdict copy
- [ ] API key management — server-side encrypted storage (users don't re-enter every session)
- [ ] BYOK — users input their own API keys (UI exists, backend pending)
- [ ] Token/credit tracking system (foundation for payment)
- [ ] Credits button on chat header — functional (currently cosmetic)
- [x] Default to dark mode
- [x] Theme system — 7 themes (Light/Dark/Tokyo Night/Lovelace/Gruvbox/Catppuccin/Nord) with icon grid picker in Settings
- [x] Theme-aware semantic color tokens (success/warning/danger) — ConsensusMeter + SummaryCard respond to active theme
- [ ] Additional custom themes (accent colors, more palettes)
- [ ] Settings page — exists with Account + Preferences tabs
- [ ] Voice input (Watson STT)

---

## ⚡ v4: Differentiation + Monetization

Differentiate beyond generic multi-model chat.

- [ ] Buy Credits flow — package selection, Stripe payment, balance update
- [ ] Subscription model — flat fee -> token pool for all models (targets non-technical users)
- [ ] Korean-first decision workflows (shopping, career, startup, study, local comparisons)
- [ ] Grounded decision mode with web-backed debate for real-world choices
- [ ] Devil's advocate mode — force one model to argue against consensus
- [ ] Debate templates (patent review, architecture decision, risk analysis)
- [ ] Custom model support (any OpenAI-compatible endpoint)
- [ ] Cost tracking dashboard
- [ ] Share full sessions via link

---

## 🔑 Key Decisions (Decide Later)

| Decision | When | Options |
|----------|------|---------|
| Database | Before v2 persistence | SQLite vs PostgreSQL |
| API key storage | Before v3 | Browser-only vs encrypted DB vs hybrid |
| Auth system | Before v3 accounts | NextAuth vs Clerk vs none |
| Payment system | Before v4 | Stripe vs custom token system |
| Deployment | After v2 stable | Vercel vs self-hosted vs Docker |

---

## 🎯 Design Philosophy

- **Less is more** — lightweight, minimal, user knows what to do on page load
- **Customization is good, clutter is bad** — good amount of options with clean UI/UX
- **One source of truth** — no duplicate information displays
- **Non-technical users welcome** — subscription model over raw API key input
