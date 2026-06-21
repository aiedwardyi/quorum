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

## ✅ v1: Working Group Chat _(Complete)_

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
- [x] Replace neutral summary schema with decision-oriented verdict schema:
  - `recommendedAnswer`
  - `voteSplit`
  - `confidence`
  - `reasons`
  - `minorityView`
  - `oppositeCase`
  - optional `modelAgreement`
- [x] Model selection UI — users choose which AIs participate (up to 4)
- [x] Response length control (short / medium / long) — UI + API wired with word targets
- [x] Configurable round count (1 / 2 / 3 / 5) — wired end-to-end, homepage -> settings -> debate loop
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
- [x] Continue discussion from completed verdict (follow-up in same thread)
- [x] Session persistence foundation
- [x] Chat history page
- [x] **BUG-015**: Document upload — files now parsed client-side and content sent to AI models
- [x] Document/media upload (PDF, DOCX, Excel, text) — parse-before-navigate on homepage, inline on chat
- [x] File upload warnings — users warned when files are truncated (>50k chars) or empty (scanned PDFs)
- [ ] Share verdict via link (public read-only snapshot page, no full transcript)
- [ ] Export conversation as markdown/PDF

---

## 🎨 v3: Accounts + Saved Work + BYOK

Make saved work, identity, user-owned model access, and recommendation UX feel complete.

- [x] User login modal with Google OAuth
- [x] User accounts (persist settings, encrypted keys, history)
- [x] Saved thread sidebar / history browser
- [ ] Follow-up question shortcuts from verdict card
- [ ] Korean / English i18n polish for decision-oriented verdict copy
- [x] API key management — server-side encrypted storage (saved keys are never returned to the browser)
- [x] BYOK backend — provider calls prefer the signed-in user's key, with server env keys as fallback
- [ ] BYOK settings UX polish
- [x] Default to dark mode
- [x] Theme system — 8 themes (Light/Dark/Tokyo Night/Lovelace/Gruvbox/Catppuccin/Nord/Solarized) with icon grid picker in Settings
- [x] Theme-aware semantic color tokens (success/warning/danger) — ConsensusMeter + SummaryCard respond to active theme
- [ ] Additional custom themes (accent colors, more palettes)
- [x] Settings page - Account + Preferences tabs
- [ ] Fix settings modal tab scroll position (BUG-039)
- [ ] Voice input (Watson STT)
- [x] Homepage chat history section (logged-in users can access past debates from homepage)
- [x] Mobile-friendly chat history (responsive history browsing on chat page)
- [x] Persistent locale in localStorage
- [x] Settings icon visible for logged-out users on homepage
- [x] Home navigation from chat page (avatar dropdown)
- [x] Consistent "Sign In" / localized labels across pages
- [x] **BUG-016**: Gemini streaming cut-off (increased chunk timeout for thinking models)
- [x] **BUG-017**: Perplexity garbled characters (HTML entity and citation artifact cleanup)
- [x] **BUG-018**: Contradicting verdicts across rounds (prior verdict context in consensus prompt)
- [x] **BUG-032**: History dropdown navigation fixed
- [x] **BUG-033**: Thread dropdown flicker fixed
- [x] **BUG-037**: Allow typing during debate (only block sending)

---

## ⚡ v4: Differentiation + Sharing

Differentiate beyond generic multi-model chat.

- [ ] Korean-first decision workflows (shopping, career, startup, study, local comparisons)
- [ ] Grounded decision mode with web-backed debate for real-world choices
- [ ] Devil's advocate mode — force one model to argue against consensus
- [ ] Debate templates (patent review, architecture decision, risk analysis)
- [ ] Custom model support (any OpenAI-compatible endpoint)
- [ ] Share full sessions via link with explicit privacy controls
- [ ] Usage dashboard (active users, debates, model usage, language distribution)
- [x] File reading support (PDF, DOCX, Excel) - parse and send as context to AI models
- [ ] Move settings into avatar dropdown (pending user test feedback)
- [ ] Rounds selector in chat header (pending user test feedback)

---

## 🔑 Key Decisions (Decide Later)

| Decision        | When       | Options                                                               |
| --------------- | ---------- | --------------------------------------------------------------------- |
| Database        | ✅ Decided | PostgreSQL on Neon + Prisma ORM                                       |
| API key storage | ✅ Decided | Encrypted DB storage; plaintext keys are never returned to the client |
| Auth system     | ✅ Decided | NextAuth v5 + Google OAuth                                            |
| Deployment      | ✅ Decided | AWS Amplify (Seoul, ap-northeast-2)                                   |

---

## 🎯 Design Philosophy

- **Less is more** — lightweight, minimal, user knows what to do on page load
- **Customization is good, clutter is bad** — good amount of options with clean UI/UX
- **One source of truth** — no duplicate information displays
- **Non-technical users welcome** — sensible defaults first, BYOK when users want control
