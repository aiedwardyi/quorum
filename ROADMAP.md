# 🏛️ Quorum — Roadmap

> Multi-AI group chat for consensus

---

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

## 📋 v2: More Models + Persistence + Core UX

Expand the roster, remember conversations, and fix core UX.

- [ ] Add Claude (Anthropic SDK) + GPT (OpenAI SDK) — currently both route to Perplexity as placeholder
- [x] Model selection UI — users choose which AIs participate (up to 4)
- [x] Response length control UI (short / medium / long) — UI done, API wiring pending
- [x] Configurable round count (3 / 5 / 7) — wired end-to-end, homepage -> settings -> debate loop
- [x] Deduplicate consensus display — ONE location, not sidebar + summary card
- [x] Fix Gemini third-person / name-prefix bug (BUG-009 — buildContents formatting)
- [x] Home page redesign — v2 with model selector, dark mode, i18n, rainbow border
- [x] Chat page UI refresh — v2 components ported, wired to v1 streaming logic
- [x] Homepage -> chat page config passthrough (sessionStorage, all settings carry over)
- [x] Consensus bar real-time updates (fills after each round)
- [x] Smart auto-scroll + scroll-to-bottom button
- [x] Thinking indicator with colored model icons (merged into ChatBubble)
- [ ] Wire response length to system prompt (short ~75w, medium ~150w, long ~300w)
- [ ] i18n for AI-generated content — pass locale to system prompt for chat + consensus API
- [ ] Between-round status feedback (brief "analyzing..." bubble)
- [ ] Stop button stuck state fix
- [ ] API error graceful handling (rate limits, quota)
- [ ] Session persistence (SQLite / Prisma)
- [ ] Chat history page
- [ ] Document/media upload (PDF analysis use case)
- [ ] Export conversation as markdown/PDF

---

## 🎨 v3: Polish + Configuration + Accounts

Make it beautiful, configurable, and personal.

- [ ] User login modal with Google OAuth
- [ ] User accounts (persist settings, keys, history)
- [ ] Korean / English i18n — UI chrome done, AI content pending (v2)
- [ ] API key management — server-side encrypted storage (users don't re-enter every session)
- [ ] BYOK — users input their own API keys (UI exists, backend pending)
- [ ] Token/credit tracking system (foundation for payment)
- [ ] Credits button on chat header — functional (currently cosmetic)
- [ ] Theme modes — light / dark done, sepia + customization TBD
- [ ] Settings page — exists with Account + Preferences tabs
- [ ] Voice input (Watson STT)

---

## ⚡ v4: Monetization + Power Features

For power users and paying customers.

- [ ] Buy Credits flow — package selection, Stripe payment, balance update
- [ ] Subscription model — flat fee -> token pool for all models (targets non-technical users)
- [ ] Devil's advocate mode — force one model to argue against consensus
- [ ] Debate templates (patent review, architecture decision, risk analysis)
- [ ] Custom model support (any OpenAI-compatible endpoint)
- [ ] Cost tracking dashboard
- [ ] Shareable sessions via link

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
