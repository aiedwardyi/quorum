# Security Audit Report - Quorum

**Repository:** aiedwardyi/quorum
**Audit Date:** 2026-04-06
**Scope:** Full read-only security audit - dependencies, API routes, client-side code, data handling
**Auditor:** Automated static analysis

---

## Executive Summary

Quorum's codebase has a moderate security posture. No SQL injection or XSS vulnerabilities were found - React's JSX escaping and Prisma's parameterized queries provide strong baseline protection. However, two API routes lack authentication entirely, there is no rate limiting, no security headers, and several dependency vulnerabilities exist.

**Finding Counts:**

| Severity | Count |
|----------|-------|
| CRITICAL | 2 |
| HIGH     | 5 |
| MEDIUM   | 5 |
| LOW      | 7 |
| INFO     | 5 |

---

## CRITICAL

### C-1: Unauthenticated `/api/chat` endpoint

- **File:** `src/app/api/chat/route.ts`
- **Description:** The `POST /api/chat` endpoint performs no authentication check. Any anonymous user can call this endpoint to trigger streaming AI responses from Gemini, Claude, GPT, and Perplexity - all of which incur per-token API costs.
- **Impact:** Unlimited API cost exposure. An attacker can automate requests and drain provider budgets. This is the most expensive endpoint in the application.
- **Evidence:** The file imports no auth utilities. Every other data-mutating route in the app calls `auth()` and checks `session.user.id` - this one does not.
- **Recommendation:** Add session verification at the top of the handler. If unauthenticated access is intentional (free tier), enforce it with server-side rate limiting per IP.

### C-2: Unauthenticated `/api/consensus` endpoint

- **File:** `src/app/api/consensus/route.ts`
- **Description:** The `POST /api/consensus` endpoint also performs no authentication check. It calls the Vertex AI Gemini API to generate verdicts.
- **Impact:** Same cost exposure as C-1. Additionally, this endpoint has a 30-second timeout, meaning an attacker can hold open many long-running connections simultaneously.
- **Recommendation:** Add authentication. Consider requiring a valid thread ID owned by the caller.

---

## HIGH

### H-1: Known dependency vulnerabilities (4 advisories)

- **Source:** `npm audit`
- **Findings:**

| Package | Severity | Advisory | Fix |
|---------|----------|----------|-----|
| `@anthropic-ai/sdk` 0.80.0 | Moderate | GHSA-5474-4w2j-mq4c - Memory tool path validation sandbox escape | Upgrade to ^0.82.0 |
| `path-to-regexp` 8.x | High | GHSA-j3q9-mxjg-w52f - ReDoS via sequential optional groups | `npm audit fix` |
| `picomatch` <=2.3.1 | High | GHSA-3v7f-55p6-f55p - Method injection in POSIX character classes | `npm audit fix` |
| `brace-expansion` <1.1.13 | Moderate | GHSA-f886-m6hf-6m8v - Zero-step sequence causes process hang | `npm audit fix` |

- **Recommendation:** Run `npm audit fix` for transitive deps. Upgrade `@anthropic-ai/sdk` to ^0.82.0 (breaking change - test before deploying).

### H-2: Outdated dependencies with available updates

- **Source:** `npm-check-updates`
- **Key outdated packages:**

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `@anthropic-ai/sdk` | ^0.80.0 | ^0.82.0 | Security fix (see H-1) |
| `next` | 16.2.0 | 16.2.2 | Patch release |
| `eslint-config-next` | 16.2.0 | 16.2.2 | Should match Next version |
| `lucide-react` | ^0.577.0 | ^1.7.0 | Major version bump |
| `@google-cloud/vertexai` | ^1.10.0 | ^1.10.4 | Patch release |

- **Recommendation:** Update `next`, `eslint-config-next`, and `@google-cloud/vertexai` as low-risk patches. Schedule `@anthropic-ai/sdk` and `lucide-react` upgrades with testing.

### H-3: No rate limiting on any endpoint

- **Files:** All routes in `src/app/api/`
- **Description:** No rate limiting, throttling, or quota enforcement exists on any endpoint. Combined with C-1 and C-2, this means unlimited unauthenticated API calls.
- **Impact:** Cost explosion from AI provider calls, database exhaustion from unlimited thread/message creation, denial of service.
- **Recommendation:** Implement rate limiting middleware. At minimum, add per-IP limits on `/api/chat` and `/api/consensus`. Consider using Vercel/Amplify edge rate limiting or an in-memory store like `lru-cache`.

### H-4: No security headers configured

- **File:** `next.config.ts`
- **Description:** The Next.js config is empty - no security headers are configured. Missing headers:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security`
  - `Referrer-Policy`
  - `Permissions-Policy`
- **Impact:** Increased attack surface for clickjacking, MIME sniffing, and missing HSTS.
- **Recommendation:** Add a `headers()` configuration to `next.config.ts` with standard security headers.

### H-5: No input size limits on message arrays

- **File:** `src/app/api/threads/[id]/messages/route.ts`
- **Description:** The POST endpoint accepts arbitrarily large message arrays and creates them all via `createMany`. No limits on array length or individual message content size.
- **Impact:** A single request could insert millions of rows, causing database exhaustion or out-of-memory errors.
- **Recommendation:** Enforce maximum array length (e.g., 100) and maximum content length per message (e.g., 50,000 chars).

---

## MEDIUM

### M-1: Error messages may leak sensitive information

- **File:** `src/app/api/chat/route.ts`, lines 246-248 (inner handler) and 272-278 (outer handler)
- **Description:** Two locations return error details to clients:
  1. The inner streaming catch (line 246-248) sanitizes `sk-` and `pplx-` key patterns but still passes through other provider-specific details (OpenAI org IDs, Google project IDs, rate limit details, internal URLs).
  2. The outer top-level catch (lines 272-278) returns raw `error.message` with no sanitization at all:
  ```
  const msg = error instanceof Error ? error.message : "Unknown error"
  return new Response(JSON.stringify({ error: msg }), ...)
  ```
- **Impact:** Provider API errors could leak internal details, API key fragments, or infrastructure information.
- **Recommendation:** Return generic error messages to clients at both locations. Log details server-side only.

### M-2: Consensus route leaks error details in development

- **File:** `src/app/api/consensus/route.ts`, lines 129-140
- **Description:** Error responses conditionally include `detail` field when `NODE_ENV === "development"`. This could expose stack traces, database errors, or provider error messages.
- **Recommendation:** Never return error details to clients in any environment.

### M-3: No validation of model names in thread creation

- **File:** `src/app/api/threads/route.ts`
- **Description:** The `models` array is checked for non-empty but individual values are not validated against the allowed provider list (`gemini`, `perplexity`, `claude`, `gpt`).
- **Recommendation:** Validate against the `VALID_PROVIDERS` whitelist.

### M-4: No validation of `responseLength` and `locale` in thread creation

- **File:** `src/app/api/threads/route.ts`
- **Description:** While the chat route validates `responseLength` against `["short", "medium", "long"]`, the thread creation route does not. Similarly, `locale` is not validated against `["en", "ko"]`.
- **Recommendation:** Validate both fields against their respective whitelists.

### M-5: PATCH `/api/threads/[id]` accepts arbitrary `status` values

- **File:** `src/app/api/threads/[id]/route.ts`, lines 52-56
- **Description:** The `status` field from the request body is passed directly to Prisma without validation against allowed values (`active`, `complete`). Any string value is accepted and stored.
- **Impact:** Data integrity issues. If status is used in business logic, unexpected values could cause undefined behavior.
- **Recommendation:** Validate against whitelist: `["active", "complete"]`.

---

## LOW

### L-1: Free debate limit enforced client-side only

- **File:** `src/components/LoginGate.tsx`
- **Description:** The `FREE_DEBATE_LIMIT` check uses localStorage, which users can clear or modify via browser DevTools.
- **Impact:** Users can bypass the free tier limit trivially. However, since `/api/chat` is unauthenticated anyway (C-1), this is moot until auth is added.
- **Recommendation:** Enforce debate limits server-side once authentication is added to the chat route.

### L-2: User queries stored in sessionStorage in plaintext

- **File:** `src/app/page.tsx`
- **Description:** Pending debate configuration (including the user's prompt text) is stored in `sessionStorage` as plaintext JSON. On shared devices, this could be visible to the next user in the same tab.
- **Impact:** Low - sessionStorage is cleared on tab close.
- **Recommendation:** Acceptable for current use case. Consider encrypting if handling sensitive queries.

### L-3: Silent error swallowing in ThreadDropdown

- **File:** `src/components/ThreadDropdown.tsx`, lines 84, 114
- **Description:** Both fetch and delete operations catch errors with empty catch blocks (`catch { // Silently fail }`). Failed deletions leave the UI in an inconsistent state.
- **Recommendation:** Add user-facing error feedback for failed operations.

### L-4: Verbose server logging of verdict generation

- **File:** `src/app/api/consensus/route.ts`
- **Description:** Console logs include timing information, message counts, confidence scores, and hedging detection. While useful for debugging, these could leak usage patterns if logs are accessible.
- **Recommendation:** Ensure production log access is restricted. Consider reducing log verbosity in production.

### L-5: No explicit CSRF token on fetch-based state mutations

- **File:** Multiple client components
- **Description:** State-changing API calls (POST, DELETE, PATCH) use `fetch()` without explicit CSRF tokens. NextAuth v5 provides CSRF protection by default for its own routes, and same-origin policy protects against basic CSRF, but explicit tokens would add defense-in-depth.
- **Recommendation:** Verify NextAuth CSRF middleware covers all routes. Consider adding explicit token validation for critical operations.

### L-6: No middleware.ts for default route protection

- **File:** (missing) - no `middleware.ts` exists in the project
- **Description:** The app relies entirely on per-route `auth()` calls. A single forgotten auth check (as demonstrated by C-1 and C-2) exposes the route completely. A Next.js middleware that requires authentication by default (with an explicit allowlist for public routes) would have prevented both critical findings.
- **Recommendation:** Create a `middleware.ts` with a default-deny auth pattern and an explicit allowlist for public routes.

### L-7: `Math.random()` used for client-side IDs

- **Files:** `src/components/MessageInput.tsx` (line 71), `src/hooks/useDebateEngine.ts` (line 48)
- **Description:** File attachment IDs use `Math.random().toString(36)`. Message IDs have a fallback to `Math.random()` when `crypto.randomUUID()` is unavailable. These are ephemeral client-side IDs (not security tokens), so the risk is minimal, but `crypto.randomUUID()` is universally available in modern browsers and should be used exclusively.
- **Recommendation:** Replace `Math.random()` usage with `crypto.randomUUID()`.

---

## INFO

### I-1: `.env.local` is properly gitignored

- `.env.local` and `.env` patterns are in `.gitignore` and are NOT tracked by git. API keys are not exposed in the repository.

### I-2: No XSS vulnerabilities found

- No `dangerouslySetInnerHTML` usage anywhere in the codebase. All dynamic content (user messages, AI responses) is rendered via React's JSX text interpolation, which auto-escapes HTML.

### I-3: Prisma parameterized queries prevent SQL injection

- All database queries use Prisma's query builder with parameterized inputs. No raw SQL queries found.

### I-4: Vertex config error messages may leak environment variable names

- **File:** `src/lib/vertex-config.ts`, lines 8-9
- Error messages include literal env var names (`Missing required environment variable: ${name}`). If these propagate to the consensus route's development error handler (M-2), they expose infrastructure configuration details.

### I-5: No CORS configuration

- No CORS headers or `Access-Control-Allow-Origin` configuration exists. While same-origin policy provides default browser protection, the unauthenticated API endpoints can be called from any origin via non-browser HTTP clients without restriction.

---

## Remediation Priority

### Immediate (before next deploy)
1. Add authentication to `/api/chat` and `/api/consensus` (C-1, C-2)
2. Create a `middleware.ts` with default-deny auth to prevent future missed auth checks (L-6)
3. Run `npm audit fix` for transitive dependency patches (H-1)

### Short-term (within 1-2 weeks)
3. Implement rate limiting on public endpoints (H-3)
4. Add security headers in `next.config.ts` (H-4)
5. Add input size validation on message arrays (H-5)
6. Sanitize all error responses (M-1, M-2)
7. Upgrade `@anthropic-ai/sdk` to ^0.82.0 (H-1, H-2)

### Medium-term (within 1 month)
8. Validate all enum inputs server-side (M-3, M-4)
9. Replace `Math.random()` with `crypto.randomUUID()` (M-5)
10. Add server-side debate count enforcement (L-1)
11. Update remaining outdated dependencies (H-2)

---

## Methodology

This audit was performed through static analysis of:
- All source files in `src/`
- Dependency tree via `npm audit` and `npm-check-updates`
- Git history for committed secrets
- `.gitignore` for proper exclusion of sensitive files
- Next.js configuration for security headers
- NextAuth configuration for authentication/CSRF

No dynamic testing, penetration testing, or runtime analysis was performed.
