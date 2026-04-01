# Quorum - v2 Sprint: Chat Page Port + UX Polish

> **Goal:** Port v2 chat page from Vite prototype to Next.js, wire to v1 streaming logic, fix UX issues.

---

## Proposed Next Sprint - Decisive Verdict + Continue Thread

> **Recommendation:** Stop optimizing for a neutral consensus recap. Make Quorum feel like a decision assistant.

### Why This Matters

- The current ending state is informative but not decisive. Users still have to interpret the debate themselves.
- `Alignment` is not a useful hero metric for most users because it measures model agreement, not support for one concrete answer.
- The real workflow gap is after the verdict: users need to continue in context, save the thread, and come back later.
- Sharing matters, but it is secondary to producing a clear recommendation and preserving the thread.

### Product Decision

- Primary output: **Recommended Answer**
- Secondary evidence:
  - `Vote Split`
  - `Top Reasons`
  - `Minority View`
  - `When the opposite choice is better`
- Keep `Model Agreement` only if it is demoted and relabeled clearly
- Treat **continue discussion** and **saved history** as core product features, not extras
- Treat **share verdict** as the first share feature, not full transcript sharing

### Sprint Scope

- [x] Change the final verdict schema from neutral summary to decision-oriented output:
  - `recommendedAnswer`
  - `voteSplit`
  - `confidence`
  - `reasons`
  - `minorityView`
  - `oppositeCase`
  - optional `modelAgreement`
- [x] Update the consensus/moderator prompt so the final result gives a recommendation, not just balanced recap
- [x] Redesign SummaryCard around `Recommended Answer` instead of `Discussion Summary`
- [x] Replace `Alignment` as the hero metric with `Vote Split`
- [ ] Add `Continue Discussion` after verdict without resetting the thread
- [ ] Let a follow-up message reuse the completed debate context and start another debate pass
- [ ] Persist threads so finished debates can be reopened later
- [ ] Add a lightweight history entry point for saved debates
- [ ] Keep `Share Verdict` narrow:
  - share the final recommendation card
  - do not share the full transcript in v1

### Non-Goals

- [ ] Full transcript sharing
- [ ] Collaboration/comments on verdict pages
- [ ] Team workspaces
- [ ] PDF export
- [ ] Multi-user editing of a thread
- [ ] Social feed behavior

### Acceptance Criteria

- Final card gives one clear recommendation unless the result is a real tie
- User can see how many models supported the winning answer
- User can understand the strongest dissent in one glance
- User can continue the same conversation after the verdict without clicking `New Discussion`
- User can reopen a prior thread later and keep working from that context
- Shared verdict, if implemented in this sprint, is verdict-only and read-only

### Build Order

1. Redesign final verdict schema and prompt
2. Update SummaryCard / ConsensusMeter wording and hierarchy
3. Add continue-thread flow after verdict
4. Add thread persistence and basic history
5. Add narrow share-verdict support if time remains

### Notes

- The product should feel like "here's what you should do" rather than "here's what everyone said."
- Continue-thread and saved history are more important than broad sharing.
- Korean-first differentiation only works if the product is sharper than generic multi-model comparison.

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

### ~~1. Final Verdict Is Too Neutral~~ ✅
Resolved: Replaced neutral consensus recap with decisive verdict system. New schema: recommendedAnswer, voteSplit, confidence, reasons, minorityView, oppositeCase. SummaryCard redesigned with recommendation as hero. ConsensusMeter relabeled from "Consensus" to "Confidence". Validation extracted to testable helper with 28 unit tests.

### 2. Continue Discussion + Save Threads
After a verdict appears, users should be able to continue in the same context. This requires persistent sessions, reopenable threads, and a basic history surface.

### ~~3. Language System (i18n for AI responses)~~ ✅
Wired locale to both `/api/chat` and `/api/consensus` system prompts. AI responses now respect EN/KR setting.

### 4. Between-Round Feedback
After last model in a round finishes and before next round starts, show a brief status bubble (e.g. "Analyzing responses and preparing next round...") so user doesn't think the debate stalled.

### ~~5. Discussion Concluded Color~~ ✅
Resolved during summary card polish. Status text under Discussion Summary is now a static green treatment, independent of score.

### ~~6. Round Counter Overflow (BUG-011)~~ ✅
Fixed via `setTimeout(() => ..., 0)` in pending prompt useEffect. React state update now completes before handleSendWithModels fires.

### ~~7. Response Length Wiring~~ ✅
Wired `responseLength` to `/api/chat` with dynamic word targets: short ~75w, medium ~150w, long ~300w.

### ~~8. Stop Button - Stuck Thinking Bubble~~ ✅
Fixed: AbortError catch now dispatches "✖️ Response cancelled." to resolve the placeholder bubble.

### 9. API Key Limit Error Handling
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

### 23. Homepage Input Font Size Too Large for Long Text
### 24. Unicode Block Characters Render as Broken Boxes in Chat
When AI responses contain Unicode block characters (U+2588 full block, quarter blocks, etc.), they render as white or black rectangular boxes that break the visual flow. Related to lack of markdown/code block rendering in chat bubbles - these characters would look fine inside a styled code block.

### 23. Homepage Input Font Size Too Large for Long Text
When pasting long text into the homepage prompt textarea, the font stays at the large placeholder size, creating an oversized wall of text. Should either reduce base font size or dynamically scale down as content grows.

### 13. Landing Page / Marketing Section
Consider adding a section below the homepage prompt area (or a separate landing page) with:
- Animated GIF or video showing a real multi-AI debate
- Short explanation of what Quorum does
- Feature highlights (consensus detection, multi-model, configurable rounds)
- Similar to Vercel/Linear/Lovable marketing pages
- Could be the first thing non-logged-in users see before scrolling up to the prompt area
