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

- [ ] Add Claude (Anthropic SDK) + GPT (OpenAI SDK)
- [ ] Model selection UI — users choose which AIs participate (up to 4)
- [ ] Response length control (short / medium / long-descriptive)
- [ ] Configurable round count
- [ ] Deduplicate consensus display — ONE location, not sidebar + summary card
- [ ] Fix Gemini third-person / name-prefix bug (buildContents formatting)
- [ ] Session persistence (SQLite / Prisma)
- [ ] Chat history page
- [ ] Document/media upload (PDF analysis use case: patent review with consensus-driven editing)
- [ ] Export conversation as markdown/PDF
- [ ] Chat page UI refresh — new fonts, better colors, cleaner layout
- [ ] Home page redesign — new font, dynamic model display (not hardcoded)

---

## 🎨 v3: Polish + Configuration + Accounts

Make it beautiful, configurable, and personal.

- [ ] User accounts (persist settings, keys, history)
- [ ] Korean / English i18n
- [ ] API key management — server-side encrypted storage (users don't re-enter every session)
- [ ] BYOK — users input their own API keys
- [ ] Token/credit tracking system (foundation for payment)
- [ ] Theme modes — light / dark / sepia + customization
- [ ] Settings page
- [ ] Voice input (Watson STT)

---

## ⚡ v4: Monetization + Power Features

For power users and paying customers.

- [ ] Subscription model — flat fee → token pool for all models (targets non-technical users)
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
