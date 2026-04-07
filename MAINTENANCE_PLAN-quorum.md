# Maintenance Plan - Quorum

> Prioritized technical debt roadmap derived from static analysis of the codebase.
> Each item references specific files and line numbers.

---

## Table of Contents

1. [Debt Inventory](#debt-inventory)
2. [Complexity Hotspots](#complexity-hotspots)
3. [Performance Concerns](#performance-concerns)
4. [Dependency Health](#dependency-health)
5. [Dead Code & Incomplete Features](#dead-code--incomplete-features)
6. [Security Hardening](#security-hardening)
7. [Architectural Smells](#architectural-smells)
8. [Configuration Gaps](#configuration-gaps)
9. [Prioritized Roadmap](#prioritized-roadmap)

---

## Debt Inventory

### Overview

| Category | Items | Critical | High | Medium | Low |
|----------|-------|----------|------|--------|-----|
| Complexity | 6 | 0 | 2 | 3 | 1 |
| Performance | 6 | 0 | 0 | 4 | 2 |
| Dependencies | 5 | 1 | 1 | 2 | 1 |
| Dead code | 3 | 0 | 0 | 1 | 2 |
| Security | 4 | 0 | 1 | 2 | 1 |
| Architecture | 5 | 0 | 0 | 4 | 1 |
| Configuration | 4 | 0 | 0 | 2 | 2 |
| **Total** | **33** | **1** | **4** | **18** | **10** |

### Bug Markers in Source

No TODO/FIXME/HACK/XXX comments found. Two BUG-015 references exist documenting a known bfcache theme workaround:

| File | Line | Comment |
|------|------|---------|
| `app/chat/page.tsx` | 64 | `// BUG-015: Re-apply theme when page becomes visible again` |
| `app/page.tsx` | 204 | `// BUG-015: Re-apply theme when page becomes visible again` |

This workaround is duplicated across two files (see [Architecture #3](#3-duplicated-theme-logic-medium)).

---

## Complexity Hotspots

Ranked by function length, nesting depth, and number of concerns.

### 1. `handleSendWithModels` - HIGH

**File:** `src/hooks/useDebateEngine.ts` lines 388-512 (124 lines)
**Nesting depth:** 4+ levels
**Concerns mixed:** Session management, round iteration, divider insertion, verdict fetching, error display

This function orchestrates the entire multi-round debate lifecycle. It contains:
- A for-loop iterating rounds (lines 425-442) with conditional divider insertion
- Session guard checks at multiple async boundaries (lines 446, 449)
- A separate try-catch for verdict fetching (lines 453-501) with 409 handling
- 11 dispatch calls spread across branches

**Refactor:** Split into `executeRounds()` and `fetchFinalVerdict()` helper functions.

### 2. `callModel` - HIGH

**File:** `src/hooks/useDebateEngine.ts` lines 213-342 (129 lines)
**Nesting depth:** 4+ levels
**Concerns mixed:** Timeout setup, streaming I/O, SSE parsing, state updates, abort coordination

The SSE parsing loop (lines 270-303) is the densest section:
- While loop with break conditions on stop/session mismatch (line 271)
- Buffer management and line splitting (lines 283-301)
- Silent JSON parse error handling (line 289)
- "done" event detection with content capture (lines 294-296)

**Refactor:** Extract SSE parsing into a standalone `parseSSEStream(reader)` async generator.

### 3. `ChatPageContent` component - MEDIUM-HIGH

**File:** `src/app/chat/page.tsx` lines 29-454 (425 lines)
**Effects:** 9 separate `useEffect` hooks
**Refs:** 9 refs for coordination (`creatingThreadRef`, `prevMessageCount`, `isHydratingRef`, `threadLoaded`, `initialPromptSent`, `pendingPrompt`, `prevShowSummary`, `hasIncrementedRef`, `mainRef`)
**State:** 8 `useState` declarations

This is a God component managing theme application, config hydration, auto-save orchestration, thread loading, scroll behavior, and UI composition.

**Refactor:** Extract into sub-hooks: `useThemeManager()`, `useAutoSave()`, `useThreadLoader()`.

### 4. POST handler in `/api/chat` - MEDIUM

**File:** `src/app/api/chat/route.ts` lines 130-279 (149 lines)
**Nesting depth:** 4 levels inside ReadableStream constructor
**Concerns mixed:** Validation, stream construction, word limiting, error sanitization

**Refactor:** Extract word-limiting logic into a `limitWords(stream, maxWords)` transform.

### 5. `SettingsModal` - MEDIUM

**File:** `src/components/SettingsModal.tsx` (282 lines)
**Concerns mixed:** Account tab, preferences tab, API key management, theme selection

**Refactor:** Split into `AccountTab` and `PreferencesTab` subcomponents.

### 6. `Header` - MEDIUM

**File:** `src/components/Header.tsx` (306 lines)
**Issues:** 2 dropdown states with synchronized open/close logic, 8-theme class conditionals repeated across lines

**Refactor:** Extract dropdown into a reusable `Dropdown` component; centralize theme class mapping.

---

## Performance Concerns

### 1. Missing memoization on ChatBubble - MEDIUM

**File:** `src/components/ChatThread.tsx` line 58
**Issue:** `messages.map()` renders all `ChatBubble` components without `React.memo`. Any parent re-render rebuilds every bubble, restarting Framer Motion animations.
**Fix:** Wrap `ChatBubble` in `React.memo`.

### 2. Missing scroll debounce - MEDIUM

**File:** `src/app/chat/page.tsx` lines 403-408
**Issue:** Scroll event handler sets state on every pixel of scroll movement, causing unnecessary re-renders.
**Fix:** Debounce the scroll handler (50-100ms) or use `requestAnimationFrame`.

### 3. Duplicate theme reapplication listeners - MEDIUM

**File:** `src/app/chat/page.tsx` lines 66-91
**Issue:** Three event listeners (`visibilitychange`, `pageshow`, `focus`) registered for BUG-015 workaround. The `focus` listener fires on every alt-tab, triggering DOM class manipulation.
**Fix:** Remove `focus` listener (redundant with `visibilitychange`), or debounce.

### 4. Large icon imports - MEDIUM

**File:** `src/components/Header.tsx` lines 1-8, `src/app/page.tsx` line 5
**Issue:** Header imports 15 Lucide icons; page.tsx imports 17. Only 3-5 are visible at any time depending on the selected theme.
**Impact:** Lucide icons are tree-shakeable, so bundle impact is minimal with proper tree shaking. This is low priority unless bundle analysis shows otherwise.

### 5. Unbounded stream accumulation - LOW

**File:** `src/hooks/useDebateEngine.ts` lines 241-315
**Issue:** Streaming responses accumulate in `fullContent` string without size limit. The 30s timeout (MODEL_TIMEOUT_MS) is the only bound.
**Fix:** Add a `MAX_RESPONSE_BYTES` constant and truncate if exceeded.

### 6. Style object recreation - LOW

**File:** `src/components/MessageInput.tsx` lines 100-101
**Issue:** Conic-gradient style object recreated on every render.
**Fix:** Memoize with `useMemo` or extract to a constant.

---

## Dependency Health

### 1. `next-auth` on beta - CRITICAL

**Package:** `next-auth@^5.0.0-beta.30`
**Issue:** Beta release with no stable v5 available. API surface may change between betas. Breaking changes between beta versions have been common in the next-auth v5 lifecycle.
**Risk:** Upgrading to a newer beta could break auth, but staying pinned means no security patches.
**Action:** Pin to exact version (`5.0.0-beta.30`, remove `^` caret). Monitor for stable v5 release. Have a rollback plan to v4.

### 2. `shadcn` listed as production dependency - HIGH

**Package:** `shadcn@^4.0.8` in `dependencies`
**Issue:** `shadcn` is a CLI tool for scaffolding shadcn/ui components. It is never imported at runtime. Listing it in `dependencies` adds unnecessary weight to production installs.
**Fix:** Move to `devDependencies` or remove entirely (can be run via `npx` when needed).

### 3. `@types/node` pinned to v20 - MEDIUM

**Package:** `@types/node@^20`
**Issue:** Node.js 20 types while the ecosystem has moved to Node 22+. Not a breaking issue but may miss newer APIs.
**Fix:** Update to match the Node version used in production.

### 4. Outdated minor versions - MEDIUM

Several dependencies have available patches:

| Package | Current | Available |
|---------|---------|-----------|
| `@anthropic-ai/sdk` | 0.80.0 | 0.85.0 |
| `@prisma/client` + `prisma` | 7.6.0 | 7.7.0 |
| `next` | 16.2.0 | 16.2.2 |
| `eslint-config-next` | 16.2.0 | 16.2.2 |

**Fix:** Run `npm update` for patch-level updates.

### 5. `pg` as direct dependency - LOW

**Package:** `pg@^8.20.0`
**Issue:** `pg` is not directly imported in source code. It is a peer dependency of `@prisma/adapter-pg`. Having it as a direct dependency is technically correct (ensures it's installed), but documenting why avoids future confusion.
**Action:** Add a comment in `package.json` or document in this plan. No code change needed.

---

## Dead Code & Incomplete Features

### 1. Incomplete file upload feature - MEDIUM

**Files:**
- `src/app/page.tsx` lines 150, 161, 285-300, 496
- `src/components/MessageInput.tsx` lines 69-76

**Issue:** File input elements, drag-and-drop handlers, and `attachedFiles` state exist but:
- Files are accepted and previewed but never sent to the server
- No integration with the debate engine
- The `files` state in `page.tsx` line 160 is declared but never used after setState
- `isDragging` state (page.tsx line 161) is set but not applied to any visual indicator

**Action:** Either complete the file upload feature or remove the dead UI code to avoid user confusion.

### 2. Duplicated Vertex AI initialization - LOW

**Files:**
- `src/lib/providers/gemini.ts` lines 10-17
- `src/app/api/consensus/route.ts` lines 60-65

**Issue:** Both files independently initialize the Vertex AI client with credential loading from `GOOGLE_APPLICATION_CREDENTIALS_JSON`. The initialization pattern is identical.
**Fix:** Extract to a shared `getVertexAIClient()` function in `src/lib/vertex-config.ts`.

### 3. Duplicated ModelIcon components - LOW

**Files:** `src/components/ChatBubble.tsx` line 44, `src/components/SettingsModal.tsx` line 29, `src/components/WelcomeHero.tsx` line 44, `src/app/page.tsx` lines 17-51

**Issue:** Four sets of model icon components with the same SVG definitions. The home page defines standalone `GeminiIcon`, `PerplexityIcon`, `ClaudeIcon`, and `GPTIcon` components, while the other three files use a `ModelIcon` switch pattern. Adding a new AI provider requires updating all four locations.
**Fix:** Extract to `src/components/ModelIcon.tsx`.

---

## Security Hardening

### 1. No rate limiting on API routes - HIGH

**Files:** All routes in `src/app/api/`
**Issue:** No throttling on any endpoint. An unauthenticated user (chat/consensus routes lack auth) or authenticated user can:
- Invoke unlimited AI provider calls, incurring unbounded API costs
- Create unlimited threads
- Generate unlimited verdicts
**Fix:** Add rate-limiting middleware. Options: Vercel's built-in rate limiting, `next-rate-limit`, or a simple in-memory token bucket per IP.

### 2. Incomplete API key sanitization - MEDIUM

**File:** `src/app/api/chat/route.ts` line 247
**Issue:** Error message sanitization only handles `sk-*` and `pplx-*` key patterns. Other credential formats (GCP service account JSON, bearer tokens) are not stripped.
**Fix:** Broaden the sanitization regex or use a deny-list approach that strips any string matching common key patterns.

### 3. Dev-mode error details in production risk - MEDIUM

**File:** `src/app/api/consensus/route.ts` line 136
**Issue:** Error `detail` field conditionally included when `process.env.NODE_ENV === "development"`. This is the safer check (only leaks in explicit dev mode, not in staging/test/unset environments), but internal errors could still surface during local development.
**Risk:** Low. The check is strict - only explicit development mode triggers it. This is standard practice.

### 4. Title input not charset-validated - LOW

**File:** `src/app/api/threads/route.ts` line 72
**Issue:** `String(title).slice(0, 80)` truncates length but does not validate character set. Could store invalid UTF-8 or control characters.
**Fix:** Strip control characters before storing.

---

## Architectural Smells

### 1. ChatPageContent is a God component - MEDIUM

**File:** `src/app/chat/page.tsx` (455 lines, 9 effects, 9 refs, 8 state vars)
**Issue:** One component handles theme management, config hydration from sessionStorage, auto-save orchestration, thread loading from URL, scroll behavior, verdict tracking, and UI composition.
**Fix:** Extract concerns into focused hooks:
- `useThemeManager(theme)` - theme application and BUG-015 workaround
- `useAutoSave(state, persistence)` - message/verdict auto-save logic
- `useThreadLoader(threadId, persistence)` - thread loading from URL

### 2. Prop drilling through component tree - MEDIUM

**File:** `src/app/chat/page.tsx` lines 370-397
**Issue:** `locale`, `responseLength`, `maxRounds`, `theme`, and multiple handlers are passed through Header and SettingsModal. Changes to settings shape require updating 3+ component interfaces.
**Fix:** Create a `ChatSettingsContext` to provide UI settings, reducing prop threading.

### 3. Duplicated theme logic - MEDIUM

**Files:** `src/app/chat/page.tsx` lines 52-62, `src/app/page.tsx` lines 204+
**Issue:** Theme read-from-localStorage, validate, and apply-to-DOM logic duplicated across the home page and chat page. Both also implement the BUG-015 workaround independently.
**Fix:** Extract to `src/hooks/useThemeManager.ts`.

### 4. Inconsistent error response format - MEDIUM

**Files:**
- `api/consensus/route.ts` lines 129-140: Returns `{ error, detail? }`
- `api/chat/route.ts` lines 248-256: Sends error as SSE chat bubble
- `api/threads/route.ts` lines 57-68: Returns `{ error: string }`

**Issue:** No standard error response envelope. Clients must handle each route's error shape differently.
**Fix:** Define a standard `{ error: string, code?: string }` format for all REST routes.

### 5. Fire-and-forget persistence pattern - LOW

**File:** `src/hooks/useThreadPersistence.ts` (all save operations)
**Issue:** All save/create operations use fire-and-forget (errors logged but not surfaced). Users have no indication when persistence fails. Documented as intentional to avoid blocking the UI, but a save-failure indicator would improve reliability confidence.
**Action:** Consider a lightweight "save failed" toast without blocking interaction.

---

## Configuration Gaps

### 1. Missing env var in `.env.example` - MEDIUM

`GOOGLE_APPLICATION_CREDENTIALS_JSON` is used in:
- `src/lib/providers/gemini.ts` line 12
- `src/app/api/consensus/route.ts` line 61

But is not documented in `.env.example`. New developers will not know this variable exists.

`NEXTAUTH_URL` is referenced in `scripts/write-env.js` line 8 but also missing from `.env.example`.

### 2. No coverage thresholds - MEDIUM

**File:** `vitest.config.ts`
**Issue:** No coverage configuration or minimum threshold. Tests can pass with 0% coverage.
**Fix:** Add `coverage: { threshold: { statements: 30 } }` once test count reaches Phase 2 (per TEST_COVERAGE_GAPS-quorum.md).

### 3. Hardcoded timeout constants - LOW

Timeout values are scattered across files with no central config:

| Constant | Value | File | Line |
|----------|-------|------|------|
| `MODEL_TIMEOUT_MS` | 30,000 | `hooks/useDebateEngine.ts` | 9 |
| `VERDICT_TIMEOUT_MS` | 30,000 | `api/consensus/route.ts` | 83 |
| `STREAM_CHUNK_TIMEOUT_MS` | 15,000 | `lib/providers/gemini.ts` | 63 |
| `FREE_DEBATE_LIMIT` | 1 | `components/LoginGate.tsx` | 8 |
| Word limits (75/150/300) | varies | `api/chat/route.ts` | 19-22 |

**Fix:** Centralize in `src/lib/constants.ts` for easier tuning.

### 4. Minimal ESLint configuration - LOW

**File:** `eslint.config.mjs`
**Issue:** Only extends `next/core-web-vitals` and `next/typescript`. No custom rules for:
- Unused imports/variables
- Maximum complexity
- Consistent return types
- React hooks exhaustive deps warnings

**Fix:** Add targeted rules as needed. Avoid over-configuring.

---

## Prioritized Roadmap

### Phase 1 - Quick Wins (1-2 hours total)

| # | Item | Effort | Impact | Files |
|---|------|--------|--------|-------|
| 1 | Move `shadcn` to devDependencies | 1 min | Cleaner prod install | `package.json` |
| 2 | Pin `next-auth` to exact version | 1 min | Prevents surprise breakage | `package.json` |
| 3 | Add missing env vars to `.env.example` | 5 min | Onboarding clarity | `.env.example` |
| 4 | Add scroll debounce | 10 min | Fewer re-renders while scrolling | `app/chat/page.tsx` |
| 5 | Wrap `ChatBubble` in `React.memo` | 5 min | Prevents animation restarts | `components/ChatBubble.tsx` |
| 6 | Centralize timeout constants | 15 min | Single place to tune | New `lib/constants.ts` |
| 7 | Add rate limiting to API routes | 1 hr | Prevents unbounded API cost abuse | New middleware or per-route |

### Phase 2 - Component Decomposition (3-5 hours)

| # | Item | Effort | Impact | Files |
|---|------|--------|--------|-------|
| 8 | Extract `useThemeManager` hook | 30 min | Eliminates duplication in 2 pages + BUG-015 workaround | New `hooks/useThemeManager.ts`, `app/chat/page.tsx`, `app/page.tsx` |
| 9 | Extract `ModelIcon` shared component | 15 min | Single update point for new providers | New `components/ModelIcon.tsx`, update 4 consumers |
| 10 | Extract Vertex AI client factory | 20 min | Eliminates init duplication | `lib/vertex-config.ts`, `lib/providers/gemini.ts`, `api/consensus/route.ts` |
| 11 | Split `SettingsModal` into tab components | 45 min | Reduces 282-line component | `components/SettingsModal.tsx` |
| 12 | Split `ChatPageContent` with sub-hooks | 2 hr | Reduces 455-line God component | `app/chat/page.tsx`, new hooks |

### Phase 3 - Complexity Reduction (3-4 hours)

| # | Item | Effort | Impact | Files |
|---|------|--------|--------|-------|
| 13 | Extract SSE parser from `callModel` | 1 hr | Testable stream parser, simpler callModel | `hooks/useDebateEngine.ts` |
| 14 | Split `handleSendWithModels` | 1 hr | Testable round execution + verdict fetch | `hooks/useDebateEngine.ts` |
| 15 | Extract word-limit transform from chat route | 30 min | Testable, reusable stream transform | `api/chat/route.ts` |
| 16 | Standardize API error responses | 45 min | Consistent client error handling | All `api/` routes |

### Phase 4 - Security & Reliability (2-3 hours)

| # | Item | Effort | Impact | Files |
|---|------|--------|--------|-------|
| 17 | Broaden error sanitization | 30 min | Prevents credential leaks | `api/chat/route.ts`, providers |
| 18 | Remove or complete file upload UI | 30 min | Eliminates dead code / user confusion | `app/page.tsx`, `components/MessageInput.tsx` |
| 19 | Add save-failure indicator | 45 min | User knows when persistence fails | `hooks/useThreadPersistence.ts`, UI |

### Phase 5 - Dependency Maintenance (1 hour, recurring)

| # | Item | Effort | Impact | Files |
|---|------|--------|--------|-------|
| 20 | Update patch-level dependencies | 15 min | Security patches | `package.json` |
| 21 | Evaluate `next-auth` stable v5 | 30 min | Exit beta dependency | `lib/auth.ts`, `package.json` |
| 22 | Update `@types/node` to match prod | 5 min | Correct type definitions | `package.json` |
| 23 | Add ESLint unused-import rule | 10 min | Catches dead imports | `eslint.config.mjs` |

> **Note:** Rate limiting (item 7) was elevated to Phase 1 due to unauthenticated `/api/chat` and `/api/consensus` routes exposing paid AI provider calls with no throttle.

---

### Heatmap: Technical Debt by File

Files ranked by total debt items. Address top files first for maximum impact.

| File | Complexity | Performance | Dead Code | Architecture | Security | Total |
|------|-----------|-------------|-----------|--------------|----------|-------|
| `app/chat/page.tsx` | 1 (MED-HIGH) | 2 | 0 | 2 | 0 | 5 |
| `hooks/useDebateEngine.ts` | 2 (HIGH) | 1 | 0 | 0 | 0 | 3 |
| `app/page.tsx` | 0 | 1 | 2 | 1 | 0 | 4 |
| `app/api/chat/route.ts` | 1 (MED) | 0 | 0 | 1 | 1 | 3 |
| `api/consensus/route.ts` | 0 | 0 | 1 | 1 | 1 | 3 |
| `components/Header.tsx` | 1 (MED) | 1 | 0 | 0 | 0 | 2 |
| `lib/providers/gemini.ts` | 0 | 0 | 1 | 0 | 0 | 1 |
| `components/SettingsModal.tsx` | 1 (MED) | 0 | 0 | 0 | 0 | 1 |
| `hooks/useThreadPersistence.ts` | 0 | 0 | 0 | 1 | 0 | 1 |
