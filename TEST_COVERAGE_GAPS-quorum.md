# Test Coverage Gap Analysis - Quorum

> Deep-trace mapping of existing tests against source code.
> Every claim references specific files and line numbers.

---

## Table of Contents

1. [Test Inventory](#test-inventory)
2. [Coverage Matrix](#coverage-matrix)
3. [Gap Analysis by Module](#gap-analysis-by-module)
4. [Critical Untested Logic](#critical-untested-logic)
5. [Edge Cases Missing Coverage](#edge-cases-missing-coverage)
6. [Risk Assessment](#risk-assessment)
7. [Recommended Test Plan](#recommended-test-plan)

---

## Test Inventory

**Framework:** Vitest 4.1.2
**Config:** `vitest.config.ts` - pattern `src/__tests__/**/*.test.ts`
**Coverage thresholds:** None configured
**Total test files:** 7
**Total test cases:** 103

| Test File | Lines | Cases | Covers Module | Tests What |
|-----------|-------|-------|---------------|------------|
| `clean-response.test.ts` | 51 | 10 | `lib/clean-response.ts` | Pure string transformation |
| `debate-engine.test.ts` | 396 | 41 | `hooks/useDebateEngine.ts` | Reducer + pure helpers only |
| `login-gate.test.ts` | 91 | 11 | `components/LoginGate.tsx` | Exported pure functions only |
| `thread-persistence.test.ts` | 75 | 8 | `hooks/useThreadPersistence.ts` | Exported pure functions only |
| `types.test.ts` | 24 | 3 | `types.ts` | THEMES constant only |
| `validate-verdict.test.ts` | 120 | 23 | `lib/validate-verdict.ts` | Full validation logic |
| `verdict-prompt.test.ts` | 46 | 7 | `lib/verdict-prompt.ts` | Prompt generation |

### What the tests actually cover

The test suite covers **pure, exported functions** exclusively. No tests exercise:
- React component rendering or interaction
- Hook behavior (useReducer, useCallback, useEffect)
- API route handlers
- Network requests or streaming
- Database operations
- Authentication flows

---

## Coverage Matrix

Mapping every source module to its test status.

### Fully Tested (pure logic exercised)

| Module | File | Tested Functions | Verdict |
|--------|------|-----------------|---------|
| Response cleaning | `lib/clean-response.ts` | `cleanResponse()` | 10 cases, good coverage |
| Verdict validation | `lib/validate-verdict.ts` | `validateVerdictResult()` | 24 cases, boundary tests included |
| Verdict prompt | `lib/verdict-prompt.ts` | `getVerdictPrompt()` | 6 cases, locale-aware |
| Theme constants | `types.ts` | `THEMES` array | 3 cases |

### Partially Tested (pure helpers only, hook/component behavior untested)

| Module | File | Tested | NOT Tested |
|--------|------|--------|------------|
| Debate engine | `hooks/useDebateEngine.ts` | `reducer()`, `createMessageId()`, `createSystemMessage()`, `getApiMessages()`, `getAIMessageCount()` | `useDebateEngine()` hook - streaming, abort, session guards, round orchestration, consensus fetch |
| Thread persistence | `hooks/useThreadPersistence.ts` | `buildSaveMessages()`, `shouldAutoSave()` | `useThreadPersistence()` hook - createThread, saveMessages, saveVerdict, loadThread, version conflict handling |
| Login gate | `components/LoginGate.tsx` | `getDebateCount()`, `incrementDebateCount()`, `shouldShowLoginGate()`, `savePendingDebate()`, `loadPendingDebate()` | LoginGate component rendering, modal interaction |

### Completely Untested

| Module | File | Lines | Criticality |
|--------|------|-------|-------------|
| Chat streaming route | `app/api/chat/route.ts` | 280 | **CRITICAL** |
| Consensus route | `app/api/consensus/route.ts` | 142 | **CRITICAL** |
| Threads CRUD route | `app/api/threads/route.ts` | 83 | HIGH |
| Thread detail route | `app/api/threads/[id]/route.ts` | 101 | HIGH |
| Messages route | `app/api/threads/[id]/messages/route.ts` | 67 | HIGH |
| Verdicts route | `app/api/threads/[id]/verdicts/route.ts` | 76 | HIGH |
| Claude provider | `lib/providers/claude.ts` | ~57 | HIGH |
| GPT provider | `lib/providers/gpt.ts` | ~55 | HIGH |
| Gemini provider | `lib/providers/gemini.ts` | ~118 | HIGH |
| Perplexity provider | `lib/providers/perplexity.ts` | ~116 | HIGH |
| Auth config | `lib/auth.ts` | 28 | MEDIUM |
| Prisma singleton | `lib/prisma.ts` | 24 | MEDIUM |
| Vertex config | `lib/vertex-config.ts` | 32 | MEDIUM |
| Home page | `app/page.tsx` | 706 | MEDIUM |
| Chat page | `app/chat/page.tsx` | 456 | MEDIUM |
| Demo page | `app/demo/page.tsx` | 61 | LOW |
| Root layout | `app/layout.tsx` | 57 | LOW |
| Error boundary | `app/error.tsx` | 57 | LOW |
| All components | `components/*.tsx` | ~1840 | LOW |

---

## Gap Analysis by Module

### 1. API Routes - Zero Coverage

#### `/api/chat` (POST) - `src/app/api/chat/route.ts`

**Untested branches:**

| Line(s) | Branch | Risk |
|---------|--------|------|
| 146-151 | Input validation: missing messages/provider | Medium - malformed requests pass through |
| 153-158 | Provider whitelist check (`VALID_PROVIDERS`) | Medium - invalid provider name could throw |
| 160-164 | Response length to maxTokens switch (short/medium/long) | Low - simple mapping |
| 188-191 | `AbortSignal.any` availability check + fallback | Medium - polyfill path untested |
| 194-200 | Pre-stream abort detection | Medium - request cancelled before streaming starts |
| 203-226 | Streaming loop with word-limit truncation | **High** - core streaming logic, truncation edge cases |
| 211-215 | Short-response truncation triggers abort | High - could corrupt response |
| 229-231 | Post-truncation polish (incomplete markdown, trailing conjunctions) | Medium - regex logic |
| 240-260 | Error handling with credential sanitization | **High** - API key leak risk |
| 63-71 | `stripUnmatchedPair` helper | Medium - markdown cleaning |
| 85-89 | Unmatched markdown pair stripping | Medium |

**No auth check present** - any unauthenticated request can invoke AI providers and incur API costs.

#### `/api/consensus` (POST) - `src/app/api/consensus/route.ts`

**Untested branches:**

| Line(s) | Branch | Risk |
|---------|--------|------|
| 38 | Locale validation and fallback to "en" | Low |
| 40, 49-54 | Message validation: array check, >= 2 AI messages | Medium |
| 84-104 | `Promise.race` timeout (30s) vs Gemini response | **High** - timeout path never tested |
| 106-107 | Deeply nested optional chaining for response text | High - any level could be undefined |
| 113-115 | Markdown code fence removal from JSON response | Medium - regex could strip valid content |
| 118 | `JSON.parse` of cleaned response | **High** - no try-catch, throws on invalid JSON |
| 124-126 | Hedging phrase detection in verdict | Low - logging only |
| 129-140 | Error handling: timeout vs generic, dev-only detail stripping | Medium |

**No auth check present** - unauthenticated access to paid Vertex AI API.

#### `/api/threads` (GET/POST) - `src/app/api/threads/route.ts`

**Untested branches:**

| Line(s) | Branch | Risk |
|---------|--------|------|
| 6-9 | Auth check (GET) | High - unauthorized data access |
| 11-23 | Cursor-based pagination logic | Medium - off-by-one errors |
| 41-43 | hasMore calculation and nextCursor | Medium |
| 49-51 | Auth check (POST) | High |
| 57-68 | Input validation chain (title, models, rounds, responseLength) | Medium |
| 72 | Title truncation to 80 chars | Low |

#### `/api/threads/[id]` (GET/PATCH/DELETE) - `src/app/api/threads/[id]/route.ts`

**Untested branches:**

| Line(s) | Branch | Risk |
|---------|--------|------|
| 5-11 | `verifyOwnership` helper | High - authorization bypass |
| 23 | Ownership check converts not-found to 404 (no info leak) | Medium |
| 61-74 | Optimistic concurrency with version check | **High** - race condition handling |
| 66 | `result.count === 0` indicates version conflict -> 409 | High |
| 76-79 | Fallback to unconditional update without version | Medium |

#### `/api/threads/[id]/messages` (POST) - `src/app/api/threads/[id]/messages/route.ts`

**Untested branches:**

| Line(s) | Branch | Risk |
|---------|--------|------|
| 9-22 | Auth + ownership verification | High |
| 32-41 | `createMany` with `skipDuplicates: true` | Medium - duplicate handling |
| 42-54 | Transaction with version conflict detection | **High** |
| 55-62 | VERSION_CONFLICT catch and 409 response | High |

#### `/api/threads/[id]/verdicts` (POST) - `src/app/api/threads/[id]/verdicts/route.ts`

**Untested branches:**

| Line(s) | Branch | Risk |
|---------|--------|------|
| 25-35 | Input validation | Medium |
| 31 | **Confidence validated as number but no range check** | **High** - accepts negative, Infinity, > 100 |
| 37-74 | Transaction with status update and version conflict | High |

---

### 2. Hooks - Only Pure Functions Tested

#### `useDebateEngine` - `src/hooks/useDebateEngine.ts` (607 lines)

The reducer (lines 115-178) and helper functions are well-tested (29 cases). The hook itself is completely untested.

**Untested critical paths:**

| Line(s) | Function/Path | Risk |
|---------|---------------|------|
| 212-342 | `callModel()` - streaming fetch, abort handling, session guards | **Critical** |
| 232-238 | 30s timeout guard with AbortController | High |
| 254-257 | Session ID guard (bail if superseded) | High |
| 270-303 | SSE parsing loop with stop coordination | **Critical** |
| 271 | `stopRef.current` check per iteration | High |
| 283-301 | SSE event parsing, "done" event handling | High |
| 289 | Silent JSON parse error skip | Medium |
| 306-309 | Cancelled flag prevents stale state writes | High |
| 316-336 | AbortError vs timeout vs genuine error distinction | High |
| 345-384 | `runRound()` - sequential model calling, stop checks | High |
| 365-379 | Mid-debate consensus check (fire-and-forget) | Medium |
| 388-510 | `handleSendWithModels()` - multi-round orchestration | **Critical** |
| 391 | Session ID increment (supersedes previous debates) | High |
| 419-442 | Multi-round loop with dividers | High |
| 448-501 | Final verdict fetch, 409 handling, error display | High |
| 527-586 | `handleStop()` - double-stop guard, post-stop consensus | High |
| 530-533 | `stoppingRef` prevents double-stop | Medium |

**Race condition risks (ref-based coordination):**
- `stopRef`, `stoppingRef`, `abortRef`, `sessionIdRef`, `messagesRef` (lines 192-200)
- Session ID increment at line 391 invalidates in-flight requests
- Timeout cleanup in finally block (line 338)

#### `useThreadPersistence` - `src/hooks/useThreadPersistence.ts` (182 lines)

`buildSaveMessages()` and `shouldAutoSave()` are tested (8 cases). The hook behavior is untested.

**Untested critical paths:**

| Line(s) | Function/Path | Risk |
|---------|---------------|------|
| 39-64 | `createThread()` - POST fetch, error handling | Medium |
| 67-96 | `saveMessages()` - incremental saves, version conflict (409) | High |
| 85-90 | 409 response handling (logs warning, returns silently) | High |
| 98-126 | `saveVerdict()` - POST fetch, fire-and-forget | Medium |
| 128-145 | `continueThread()` - version bump | Medium |
| 147-163 | `loadThread()` - GET fetch, null on error | Medium |

---

### 3. AI Providers - Zero Coverage

All four providers share the same interface pattern but have zero test coverage.

#### Common untested patterns across all providers:

| Pattern | Files | Risk |
|---------|-------|------|
| API key validation (throws if missing) | All 4 providers | Medium |
| Streaming async generator behavior | All 4 providers | **High** |
| Error sanitization (sk-*, pplx-* removal) | claude.ts, gpt.ts | **High** - credential leak risk |
| AbortSignal propagation to SDK/fetch | All 4 providers | Medium |
| Empty/malformed chunk handling | All 4 providers | Medium |

#### Provider-specific untested logic:

| Provider | File | Untested Path | Risk |
|----------|------|---------------|------|
| Gemini | `lib/providers/gemini.ts:65-94` | Custom timeout wrapper (`withTimeout`) | High |
| Gemini | `lib/providers/gemini.ts:12-16` | Conditional credential loading from JSON env var | Medium |
| Gemini | `lib/providers/gemini.ts:113-115` | Silent skip of chunks without text | Medium |
| Perplexity | `lib/providers/perplexity.ts:5-19` | Multi-AI message packing into single user message | High |
| Perplexity | `lib/providers/perplexity.ts:88-115` | SSE parsing loop with buffer management | **High** |
| Perplexity | `lib/providers/perplexity.ts:102` | `[DONE]` sentinel handling | Medium |

---

### 4. Library Utilities - Partial Coverage

| Module | Tested | Untested | Risk |
|--------|--------|----------|------|
| `lib/clean-response.ts` | `cleanResponse()` - 10 cases | - | Fully covered |
| `lib/validate-verdict.ts` | `validateVerdictResult()` - 24 cases | - | Fully covered |
| `lib/verdict-prompt.ts` | `getVerdictPrompt()` - 6 cases | - | Fully covered |
| `lib/auth.ts` | - | NextAuth config, session callback, missing-credential warnings | Medium |
| `lib/prisma.ts` | - | Singleton creation, Proxy for missing DATABASE_URL | Medium |
| `lib/vertex-config.ts` | - | `getRequiredEnv()`, placeholder value rejection | Medium |
| `lib/utils.ts` | - | `cn()` utility | Low (thin wrapper) |

---

## Critical Untested Logic

Ranked by blast radius and likelihood of regression.

### Tier 1 - Highest Risk

**1. Streaming SSE pipeline (chat route + useDebateEngine)**

The entire path from client request through SSE streaming to UI state update is untested:

```
Client fetch -> /api/chat (SSE stream creation) -> Provider async generator
   -> chunk encoding -> ReadableStream -> client reader -> SSE parsing
   -> reducer dispatch -> UI render
```

Every link in this chain has branching logic. A single regression breaks the core feature.

**Files:** `app/api/chat/route.ts`, `hooks/useDebateEngine.ts` (lines 270-303)
**Specific risks:**
- Word-limit truncation corrupts response (lines 202-226 in chat route)
- SSE parse failure silently drops chunks (line 289 in useDebateEngine)
- Abort/timeout race leaves stream open (lines 232-238, 316-336)

**2. Consensus generation pipeline**

```
Client fetch -> /api/consensus -> Vertex AI (Gemini) -> JSON parse -> validate -> UI
```

**Files:** `app/api/consensus/route.ts`, `lib/validate-verdict.ts`
**Specific risks:**
- `JSON.parse` at line 118 has no try-catch - invalid JSON from Gemini crashes the route
- 30s timeout race (lines 84-104) - timeout path never exercised
- Markdown fence removal (line 113-115) could strip valid JSON content

**3. Version conflict handling in thread persistence**

Optimistic concurrency control exists across 3 routes but is never tested:
- `threads/[id]/route.ts` lines 61-74
- `threads/[id]/messages/route.ts` lines 42-54
- `threads/[id]/verdicts/route.ts` lines 37-74

A bug here causes silent data loss or corrupt thread state.

**4. Unauthenticated AI API access**

The `/api/chat` and `/api/consensus` routes have no `await auth()` check. Any unauthenticated request can invoke paid AI providers (Anthropic, OpenAI, Perplexity, Vertex AI), incurring unbounded API costs.

**Files:** `app/api/chat/route.ts`, `app/api/consensus/route.ts`

### Tier 2 - High Risk

**5. API key sanitization in error messages**

Provider errors are sanitized with regex patterns:
- `claude.ts` line 54: `msg.replace(/sk-[a-zA-Z0-9-_]+/g, "sk-***")`
- `gpt.ts` line 52: same pattern

Risks:
- Only `sk-*` and `pplx-*` patterns are stripped
- Other credential formats (bearer tokens, GCP credentials) are not sanitized
- Regex could fail on unusual key formats

**6. Auth and ownership verification**

Thread routes verify ownership via `verifyOwnership()` (threads/[id]/route.ts lines 5-11). None of this is tested.

**7. Perplexity SSE parser**

Custom SSE parsing in `lib/providers/perplexity.ts` (lines 88-115):
- Buffer-based line splitting
- Manual `data:` prefix detection
- `[DONE]` sentinel handling
- Silent JSON parse error skip

This is a hand-rolled protocol parser with no tests.

### Tier 3 - Medium Risk

**8. Gemini timeout wrapper**

Custom async generator timeout in `lib/providers/gemini.ts` (lines 65-94):
- `Promise.race` between `iterator.next()` and timeout
- Cleanup in finally block
- 15s per-chunk timeout

**9. Multi-round debate orchestration**

`useDebateEngine.handleSendWithModels` (lines 388-510):
- Session ID coordination across rounds
- Stop signal checking between rounds
- Round divider insertion
- Post-debate verdict generation

**10. Chat page lifecycle**

`app/chat/page.tsx` (456 lines):
- Theme hydration from localStorage (lines 51-62)
- Config hydration from sessionStorage (lines 93-156)
- Auto-save guards (isHydrating, creatingThread, etc.)
- Thread loading from URL params (lines 278-350)

---

## Edge Cases Missing Coverage

### Input Boundary Cases

| Location | Edge Case | Why It Matters |
|----------|-----------|----------------|
| `api/chat/route.ts:160` | `responseLength` not in ["short","medium","long"] | Falls to default, but behavior undocumented |
| `api/consensus/route.ts:38` | Locale is neither "en" nor "ko" | Defaults to "en" - could be unexpected |
| `api/threads/route.ts:72` | Title exactly 80 chars vs 81 chars | Truncation boundary |
| `api/threads/[id]/verdicts/route.ts:31` | Confidence = -1, Infinity, NaN | No range check in route (only in `validateVerdictResult`) |
| `hooks/useDebateEngine.ts:422` | Single-model debate (rounds forced to 1) | Different flow than multi-model |

### Streaming Edge Cases

| Location | Edge Case | Why It Matters |
|----------|-----------|----------------|
| `api/chat/route.ts:202-226` | Response hits word limit mid-word | Truncation logic could break words |
| `api/chat/route.ts:211-215` | Provider abort after truncation | Abort timing could race with final chunk |
| `hooks/useDebateEngine.ts:283-301` | SSE event split across ReadableStream chunks | Buffer reassembly required |
| `hooks/useDebateEngine.ts:289` | Malformed JSON in SSE data field | Silently skipped - could lose content |
| `lib/providers/perplexity.ts:94-96` | SSE data split across buffer boundaries | Line splitting must handle partial lines |
| `lib/providers/gemini.ts:112` | Chunk timeout fires during slow but valid stream | 15s per-chunk could be too aggressive |

### Concurrency Edge Cases

| Location | Edge Case | Why It Matters |
|----------|-----------|----------------|
| `hooks/useDebateEngine.ts:391` | User starts new debate while previous is streaming | Session ID race |
| `hooks/useDebateEngine.ts:530-533` | User clicks stop twice rapidly | Double-stop guard via stoppingRef |
| `hooks/useThreadPersistence.ts:85-90` | Two tabs save messages simultaneously | Version conflict (409) |
| `app/chat/page.tsx:204-222` | Auto-save triggers during thread creation | `creatingThreadRef` guard |
| `api/threads/[id]/messages/route.ts:42-54` | Concurrent message saves from different tabs | Transaction isolation |

### Error Recovery Cases

| Location | Edge Case | Why It Matters |
|----------|-----------|----------------|
| `api/consensus/route.ts:118` | Gemini returns valid text but not valid JSON | `JSON.parse` throws, no fallback |
| `hooks/useDebateEngine.ts:464-500` | Consensus fetch returns 409 during verdict | Error message injected but debate state unclear |
| `hooks/useThreadPersistence.ts:67-96` | Network failure during incremental save | Fire-and-forget, messages lost silently |
| `app/chat/page.tsx:243-255` | Page closes between message save and verdict save | Orphaned verdict or lost verdict |

---

## Risk Assessment

### Coverage by Risk Tier

```
                    Tested    Untested
                    ------    --------
CRITICAL paths:       0          4      (streaming, consensus, version conflicts,
                                         unauthenticated API access)
HIGH risk paths:      0          7      (sanitization, providers, SSE parsing,
                                         ownership, Gemini timeout, auth,
                                         Perplexity parser)
MEDIUM risk paths:    3          7      (debate orchestration, chat lifecycle,
                                         home page, config, auth config, prisma, vertex)
LOW risk paths:       4          3      (types, utils, component rendering, demo/layout)
```

### Estimated Line Coverage

| Category | Lines | Tested Lines | Coverage |
|----------|-------|-------------|----------|
| Pure utilities | ~180 | ~180 | ~100% |
| Reducer logic | ~65 | ~65 | ~100% |
| Hook behavior | ~575 | 0 | 0% |
| API routes | ~750 | 0 | 0% |
| Provider functions | ~350 | 0 | 0% |
| Pages (home, chat, demo, layout, error) | ~1280 | 0 | 0% |
| Components | ~1840 | 0 | 0% |
| Config/auth | ~85 | 0 | 0% |
| **Total** | **~5125** | **~245** | **~5%** |

---

## Recommended Test Plan

Prioritized by risk reduction per effort.

### Phase 1 - Critical Path Coverage (High Impact, Moderate Effort)

**1. API route handler tests**

Target: `api/chat`, `api/consensus`, `api/threads`, `api/threads/[id]`, `api/threads/[id]/messages`, `api/threads/[id]/verdicts`

Approach: Unit test each route handler with mocked Prisma, mocked auth, and mocked provider functions.

Test cases needed:
- Auth rejection (401) for each protected route
- Input validation (400) for each field
- Successful creation (201) with correct DB writes
- Version conflict (409) for concurrent updates
- Ownership verification (404 for non-owner)

Estimated: ~40 test cases across 6 route files.

**2. Verdict route confidence validation**

Target: `api/threads/[id]/verdicts/route.ts` line 31

The route validates confidence as `typeof confidence !== "number"` but does not check range. The `validateVerdictResult` function (which IS tested) checks 0-100, but the API route does not call it.

Test: Confirm that confidence values of -1, 101, Infinity, and NaN are rejected.

**3. Consensus JSON.parse safety**

Target: `api/consensus/route.ts` line 118

`JSON.parse` is called without try-catch on Gemini's response. If the AI returns invalid JSON, the route crashes.

Test: Provide a response that is valid text but not valid JSON, confirm graceful error.

### Phase 2 - Provider and Streaming Tests (High Impact, Higher Effort)

**4. Provider stream function tests**

Target: All 4 files in `lib/providers/`

Approach: Mock the underlying SDKs (Anthropic, OpenAI, VertexAI) and Perplexity fetch. Test the async generator interface.

Test cases needed per provider:
- Yields chunks correctly from SDK stream
- Handles AbortSignal (stops yielding)
- Sanitizes API keys in error messages
- Handles empty response gracefully
- Provider-specific: Gemini timeout wrapper, Perplexity SSE parsing, Perplexity message packing

Estimated: ~20 test cases across 4 providers.

**5. Chat route streaming integration**

Target: `api/chat/route.ts` lines 169-263

Approach: Mock the provider stream function, test the ReadableStream output.

Test cases needed:
- SSE format: chunks arrive as `data: {"chunk":"..."}\n\n`
- Done event: `data: {"done":true,...}\n\n`
- Word-limit truncation for short responses
- Post-truncation polish (markdown cleanup)
- Error event on provider failure
- Abort signal propagation

Estimated: ~12 test cases.

### Phase 3 - Hook Behavior Tests (Medium Impact, High Effort)

**6. useDebateEngine integration tests**

Target: `hooks/useDebateEngine.ts` lines 212-586

Approach: Use `@testing-library/react` with `renderHook`. Mock fetch for API calls.

Test cases needed:
- Single model, single round debate
- Multi-model, multi-round debate with dividers
- Stop mid-debate triggers consensus
- Timeout after 30s aborts model call
- New debate supersedes in-flight debate (session ID)
- Error during streaming shows error message
- Consensus failure shows error in analyzing message

Estimated: ~15 test cases.

**7. useThreadPersistence integration tests**

Target: `hooks/useThreadPersistence.ts` lines 39-163

Approach: Mock fetch and NextAuth session.

Test cases needed:
- createThread returns ID on success, null on failure
- saveMessages sends only unsaved messages (incremental)
- saveMessages handles 409 version conflict
- loadThread returns thread data or null
- All operations return null/void when not logged in

Estimated: ~10 test cases.

### Phase 4 - Security and Config Tests (Medium Impact, Low Effort)

**8. API key sanitization tests**

Target: `lib/providers/claude.ts` line 54, `lib/providers/gpt.ts` line 52

Test cases:
- `sk-ant-api...` key is replaced with `sk-***`
- `sk-proj-...` key is replaced
- `pplx-...` key is replaced
- GCP credential JSON is not leaked
- Multiple keys in one message are all sanitized

Estimated: ~8 test cases.

**9. Vertex config validation tests**

Target: `lib/vertex-config.ts`

Test cases:
- Missing VERTEX_PROJECT_ID throws
- Missing VERTEX_LOCATION throws
- Placeholder value "your-project-id" is rejected
- Valid values return config object

Estimated: ~6 test cases.

### Phase 5 - Component Tests (Lower Impact)

**10. Component rendering tests**

Target: Key interactive components

Priority components:
- `LoginGate.tsx` - modal appears at debate limit
- `MessageInput.tsx` - Shift+Enter vs Enter behavior
- `ConsensusMeter.tsx` - score display and color thresholds

Approach: `@testing-library/react` with vitest-dom matchers.

Estimated: ~15 test cases.

### Summary

| Phase | Tests | Effort | Risk Reduction |
|-------|-------|--------|----------------|
| 1. API route handlers | ~43 | Medium | **Critical** - covers auth, validation, concurrency |
| 2. Provider + streaming | ~32 | Medium-High | **High** - covers core feature path |
| 3. Hook behavior | ~25 | High | **High** - covers orchestration logic |
| 4. Security + config | ~14 | Low | **Medium** - covers credential safety |
| 5. Components | ~15 | Medium | **Low** - covers UI correctness |
| **Total** | **~129** | | |

Adding these ~129 tests would raise estimated coverage from ~5% to ~35-45%, with all critical and high-risk paths exercised.

> **Note:** `src/lib/providers/test-providers.ts` is a manual integration test script (run via `npm run test:providers`) - it is not part of the Vitest automated suite and is excluded from the counts above.
