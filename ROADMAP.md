# 🏛️ Quorum — Roadmap

> Multi-AI group chat for consensus

---

## 🔨 v1: Working Group Chat *(Current)*

The core experience — a group chat where you + Gemini + Perplexity discuss a topic together.

- [x] Project scaffolding (Next.js + Tailwind + shadcn/ui)
- [x] Gemini + Perplexity provider wrappers
- [x] Chat API route (SSE streaming)
- [x] Consensus scoring API route
- [x] Chat UI — thread, bubbles, input bar, model selector
- [x] Consensus meter + summary card
- [x] Wire end-to-end flow
- [ ] Home page with prompt input

**Ship when:** You can ask a question, watch two AIs discuss it, steer the conversation, and see consensus form.

---

## 📋 v2: More Models + Persistence

Expand the roster and remember conversations.

- [ ] Add Claude (Anthropic SDK) + GPT (OpenAI SDK)
- [ ] Session persistence (SQLite / Prisma)
- [ ] Chat history page
- [ ] Document upload (PDF/text injected into thread)
- [ ] Export conversation as markdown

---

## 🎨 v3: Polish + Configuration

Make it beautiful and configurable.

- [ ] Korean / English i18n
- [ ] BYOK — users manage their own API keys
- [ ] Settings page
- [ ] Dark mode
- [ ] Voice input (Watson STT)

---

## ⚡ v4: Power Features

For power users and advanced workflows.

- [ ] Devil's advocate mode — force one model to argue against consensus
- [ ] Debate templates (patent review, architecture decision, risk analysis)
- [ ] Custom model support (any OpenAI-compatible endpoint)
- [ ] Cost tracking dashboard
- [ ] Shareable sessions via link

---

## 🔑 Key Decisions (Decide Later)

| Decision | When | Options |
|----------|------|---------|
| Database | Before v2 | SQLite vs PostgreSQL |
| API key storage | Before v3 | Browser-only vs encrypted DB vs hybrid |
| Auth system | Before sharing features | NextAuth vs Clerk vs none |
| Deployment | After v1 stable | Vercel vs self-hosted vs Docker |
