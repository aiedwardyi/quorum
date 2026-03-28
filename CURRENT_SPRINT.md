# Quorum - v2 Sprint: Chat Page Port + UX Polish

> **Goal:** Port v2 chat page from Vite prototype to Next.js, wire to v1 streaming logic, fix UX issues.

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

---

## Open Issues (Priority Order)

### 1. Language System (i18n for AI responses)
Pass locale to API routes. Add to system prompt: "Always respond in {Korean|English}." Apply to both `/api/chat` and `/api/consensus` so summary card content matches locale. UI chrome translations already work - this is for AI-generated content only.

### 2. Between-Round Feedback
After last model in a round finishes and before next round starts, show a brief status bubble (e.g. "Analyzing responses and preparing next round...") so user doesn't think the debate stalled.

### 3. Discussion Concluded Color
The "Discussion Concluded" / "Consensus Reached" text under Discussion Summary changes color based on score. Make it static green or blue regardless of score.

### 4. Round Counter Overflow
If user selects 5 rounds, counter shows "5/3" instead of "5/5". The `maxRounds` state updates but the header display uses the wrong denominator.

### 5. Response Length Wiring
`responseLength` (short/medium/long) is stored in state but never sent to the API. Wire it into the system prompt with word targets: short ~75 words, medium ~150 words, long ~300 words.

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

### 18. Sepia + Custom Color Modes
Add sepia theme as a third option alongside light/dark. Build foundation for user-customizable color themes (accent colors, background tones). Eddie wants extensive customization — this is a personal power tool.

### 13. Landing Page / Marketing Section
Consider adding a section below the homepage prompt area (or a separate landing page) with:
- Animated GIF or video showing a real multi-AI debate
- Short explanation of what Quorum does
- Feature highlights (consensus detection, multi-model, configurable rounds)
- Similar to Vercel/Linear/Lovable marketing pages
- Could be the first thing non-logged-in users see before scrolling up to the prompt area
