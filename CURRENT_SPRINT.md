# Quorum - v2 Sprint: Chat Page Port + UX Polish

> **Goal:** Port v2 chat page from Vite prototype to Next.js, wire to v1 streaming logic, fix UX issues.

---

## Proposed Next Sprint - Share Verdict

> **Recommendation:** Worth building, but keep it narrow. Ship a simple shareable verdict page first. Do not start with full transcript sharing.

### Why This Matters

- Users making important decisions need a clean artifact they can send to a friend, cofounder, teammate, or reviewer.
- "Copy summary" is useful for fast paste, but it is weaker than a durable link when the user wants to prove what the models concluded.
- For high-stakes use cases like patent review, architecture choices, or trust-sensitive questions, the missing artifact is not social sharing. It is an auditable verdict page.
- After the rounds end, users also need a path to continue the same thread instead of being forced into only `New Discussion` or `Copy`.
- If sessions are not saved, share value drops because the user cannot return, reopen context, or continue the work later.

### Product Decision

- Default share target: **Share Verdict**
- Deferred follow-up: **Share Full Debate**
- Keep the first UX minimal: one share action from the summary area, with a simple choice between copy text and create link.
- Treat **continue this discussion** and **session history** as part of the same product gap. The real issue is not only sharing; it is preserving and reusing a finished debate.

### Sprint Scope

- [ ] Add a `Share` action near the final summary/verdict UI
- [ ] Add an `Ask Follow-up` or `Continue Discussion` action after rounds complete
- [ ] Let the user send a new message into the existing completed thread and start another debate pass with prior context preserved
- [ ] Persist completed sessions so users can reopen them later
- [ ] Add a lightweight history entry point so a user can revisit prior debates
- [ ] Create a share snapshot payload containing:
  - Original user question
  - Final summary
  - Consensus score
  - Agreements
  - Disagreements
  - Participating models
  - Timestamp
- [ ] Create a public read-only route for shared verdicts
- [ ] Generate a stable link users can copy and send
- [ ] Add a lightweight privacy choice:
  - `Anyone with link`
  - `Private / don't create link`
- [ ] Make it explicit that full transcript sharing is not included in v1 of this feature

### Non-Goals

- [ ] Full round-by-round transcript sharing
- [ ] PDF export
- [ ] Password protection
- [ ] Auth-gated sharing system
- [ ] Editable shared pages
- [ ] Social feed, comments, likes, or collaboration
- [ ] Multi-user collaborative commenting on shared threads

### Acceptance Criteria

- User can finish a debate and create a shareable verdict link in under 10 seconds
- User can ask a follow-up question from the completed thread without losing prior context
- User can reopen a prior session from history and see the saved thread plus final verdict
- Shared page is readable on mobile and desktop
- Shared page clearly shows question, verdict, consensus score, key agreements/disagreements, and which models participated
- Shared page is read-only and cannot mutate the original session
- If user does not opt into link sharing, nothing is published

### Build Order

1. Define session persistence model for completed debates
2. Add reopen/history foundation for saved sessions
3. Add follow-up flow that continues from prior thread context
4. Define shared verdict snapshot schema and public route
5. Add share action, copy-link flow, and basic empty/error states
6. Polish wording and privacy messaging

### Notes

- This fits the product's "less is more" philosophy if the first version is verdict-only.
- Full conversation sharing should be a separate follow-up after validating that users actually need audit depth.
- Continuing a finished discussion and reopening history are likely more important than full transcript sharing.

---

## Completed (2026-03-28)

- [x] Port all 8 v2 components to Next.js (motion/react -> framer-motion, import paths)
- [x] Wire v2 UI to v1 streaming/API logic in chat/page.tsx
- [x] Delete ModelSelector.tsx (model selection now in homepage + settings)
- [x] Global cursor:pointer for all non-disabled buttons
- [x] Font fix (Geist Sans on chat page)
- [x] Header tooltips (round counter, response length)
- [x] Consensus meter cursor-help on label
- [x] SummaryCard status text font-semibold + % color fix
- [x] Gemini multicolor gradient logo across all components (SettingsModal, WelcomeHero, ChatBubble)
- [x] Theme toggle spin/wobble animations (sun/moon icons)
- [x] Buy Credits button shimmer effect
- [x] Header credits hover brightness
- [x] Dropdown close-on-click fix (document.mousedown listener - backdrop-blur stacking context issue)
- [x] Discussion Rounds selector (3/5/7) in Settings > Preferences with tooltips
- [x] Thinking indicator merged into ChatBubble (colored dots, model icon, no flicker)
- [x] GPT capitalization fix in thinking state
- [x] Consensus bar stays visible during entire debate (added isDebating condition)
- [x] Final consensus fetch when all rounds complete (no early exit at 80%)
- [x] All rounds run as user selected (removed early consensus stop)
- [x] Auto-scroll to top of summary card
- [x] Smart auto-scroll (only if user is near bottom, respects manual scrolling)
- [x] Scroll-to-bottom button (centered, semi-transparent, above bottom bar)
- [x] Thin scrollbar (4px, subtle, light/dark mode)
- [x] Homepage -> chat page prompt passthrough fix (React strict mode compatible)
- [x] Settings wired: models, rounds, response length, locale, theme all carry from homepage
- [x] Premium summary/final verdict polish (higher-contrast SummaryCard, final verdict eyebrow, clearer alignment treatment, demo-ready dark mode)

---

## Open Issues (Priority Order)

### ~~1. Language System (i18n for AI responses)~~ ✅
Wired locale to both `/api/chat` and `/api/consensus` system prompts. AI responses now respect EN/KR setting.

### 2. Between-Round Feedback
After last model in a round finishes and before next round starts, show a brief status bubble (e.g. "Analyzing responses and preparing next round...") so user doesn't think the debate stalled.

### ~~3. Discussion Concluded Color~~ ✅
Resolved during summary card polish. Status text under Discussion Summary is now a static green treatment, independent of score.

### ~~4. Round Counter Overflow (BUG-011)~~ ✅
Fixed via `setTimeout(() => ..., 0)` in pending prompt useEffect. React state update now completes before handleSendWithModels fires.

### ~~5. Response Length Wiring~~ ✅
Wired `responseLength` to `/api/chat` with dynamic word targets: short ~75w, medium ~150w, long ~300w.

### ~~6. Stop Button - Stuck Thinking Bubble~~ ✅
Fixed: AbortError catch now dispatches "✖️ Response cancelled." to resolve the placeholder bubble.

### 7. API Key Limit Error Handling
When API keys hit rate limits or quota, show a graceful error message in chat (not a crash). Something like "Gemini encountered an error. Check your API quota." with a suggested follow-up action.

### 8. Credits Button Functionality
The credits display in the header (1,250) is static/cosmetic. Wire it to open the settings modal account tab or a dedicated credits modal.

### 9. User Login Modal
Create a login modal with Google OAuth integration. Required for persistent settings, API key storage, and credit purchases.

### 10. Buy Credits Flow
Create a purchase flow for the Buy Credits button in settings. Needs: credit package selection, payment integration (Stripe), confirmation, balance update.

### ~~11. Homepage Settings Modal Alignment~~ ✅
Homepage now uses shared `SettingsModal` component with `showPreferences={false}` (hides sidebar + preferences tab, shows only Account: credits + API keys). Avatar dropdown and login button match chat page Header style.

### 14. Back/Forward Navigation Bug
Browser back/forward between homepage and chat page causes: (1) page content invisible (framer-motion `initial={{ opacity: 0 }}` doesn't replay `animate` on cached page restore), (2) theme reverts to light mode (useState defaults, useEffect doesn't re-run), (3) buttons become unclickable. Hard refresh fixes all three. Root cause: Next.js App Router client-side cache + browser bfcache don't remount components, so React state and effects go stale. Affects both `/` and `/chat`.

### 12. First-Time User Onboarding Flow
Users who haven't logged in or entered API keys need a clear path. Options to consider:
- Allow browsing homepage freely (see what the site does before committing)
- Block "Send" until login or API key entered, with clear messaging
- Demo/preview mode with pre-recorded conversation
- Landing page with GIF/video demo showing a real debate (like Vercel/Linear/Lovable)
- FAQ/docs page with screenshots explaining the product

### 15. Cancelled Message Styling
The "✖️ Response cancelled." message uses a purple emoji that doesn't match the premium tone. Replace with a clean, muted text like "— Response stopped" or plain "Response cancelled." with subtle styling. No emoji.

### 16. Homepage Language Toggle Label
The homepage header shows `한` when in Korean mode. Consider whether this should be `KR`, `한국어`, or a globe icon for better clarity.

### 17. Default Theme
Switch default theme to dark mode. Power users and decision-makers expect a pro-tool aesthetic. Light mode remains available.

### ~~18. Sepia + Custom Color Modes~~ ✅
Shipped 3 new themes (Gruvbox, Catppuccin Mocha, Nord) bringing total to 7. Settings picker redesigned as responsive icon grid. Semantic color tokens (success/warning/danger) added so ConsensusMeter and SummaryCard respond to active theme. Shared THEMES constant prevents drift. Merged via PR #38.

### 19. Round Divider Labels Between Rounds
Show a visual "ROUND 1", "ROUND 2", etc. divider/label between rounds in the chat thread. Gives the debate clear visual structure so users can scan which round they're reading. Spotted in a Claude Code promotional demo build — clean horizontal rule with centered round number text.

### 20. Round Selection Display Bug (BUG-013)
Round selector UI lets user pick 3 rounds, but the header still shows "5/3" instead of "3/3". The selected round count isn't propagating correctly to the round counter display. Cosmetic but confusing — users think their setting didn't save.

### 21. AI Models Fake-Read URLs / GitHub Links (BUG-014)
When a user pastes a GitHub repo link (or any URL) into the chat, the AI models pretend they read it — they respond as if they visited the page and give fabricated advice based on the URL. None of the models actually fetch or read the linked content. This is misleading and produces hallucinated guidance. Need to either: (a) actually fetch and inject URL content into the prompt context, or (b) have models honestly say they cannot access links.

### 22. Document Upload Not Sent to AI Models (BUG-015)
The file upload UI lets users attach documents, and the attachment appears in the chat UI, but the file content is never included in the API payload sent to the AI models. Models only see the user's text message, not the document. This makes the upload feature non-functional — users think their file was shared but the AIs are responding blind.

### 13. Landing Page / Marketing Section
Consider adding a section below the homepage prompt area (or a separate landing page) with:
- Animated GIF or video showing a real multi-AI debate
- Short explanation of what Quorum does
- Feature highlights (consensus detection, multi-model, configurable rounds)
- Similar to Vercel/Linear/Lovable marketing pages
- Could be the first thing non-logged-in users see before scrolling up to the prompt area
