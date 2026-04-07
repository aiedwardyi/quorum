# Quorum - Architecture Guide

> Canonical patterns derived from the cleanest parts of the codebase.
> When in doubt, follow this document. When extending the codebase, match these patterns.

---

## Table of Contents

1. [Directory Layout](#directory-layout)
2. [Component Conventions](#component-conventions)
3. [Custom Hooks](#custom-hooks)
4. [API Routes](#api-routes)
5. [AI Provider Abstraction](#ai-provider-abstraction)
6. [Type System](#type-system)
7. [Styling](#styling)
8. [State Management](#state-management)
9. [Data Fetching](#data-fetching)
10. [Database Access](#database-access)
11. [Authentication](#authentication)
12. [Error Handling](#error-handling)
13. [Internationalization](#internationalization)
14. [Testing](#testing)
15. [Configuration](#configuration)
16. [Known Drift and Remediation](#known-drift-and-remediation)

---

## Directory Layout

```
src/
  app/                        # Next.js App Router (pages + API routes)
    api/
      auth/[...nextauth]/     # NextAuth catch-all
      chat/                   # Streaming chat completions (SSE)
      consensus/              # Verdict generation
      threads/                # Thread CRUD
        [id]/
          messages/            # Message persistence
          verdicts/            # Verdict storage
    chat/                     # Main chat page
    demo/                     # Demo page
    layout.tsx                # Root layout
    globals.css               # Global styles + theme tokens
  components/                 # React components (flat, one file per component)
    ui/                       # shadcn/ui primitives
  hooks/                      # Custom React hooks
  lib/                        # Shared utilities
    providers/                # AI provider stream functions
  types/                      # TypeScript declaration files (e.g. next-auth.d.ts)
  types.ts                    # Central type definitions
  __tests__/                  # Vitest unit tests
prisma/
  schema.prisma               # Database schema
```

**Rules:**

- One component per file - no barrel `index.ts` exports.
- Hooks live in `src/hooks/`, not co-located with components.
- Provider integrations live in `src/lib/providers/`.
- All shared types go in `src/types.ts`. Module augmentations go in `src/types/*.d.ts`.

---

## Component Conventions

**Reference:** `src/components/ChatBubble.tsx`, `src/components/MessageInput.tsx`

### Structure

```tsx
"use client"

import { /* React hooks */ } from "react"
import { motion } from "framer-motion"
import type { Message, Provider, Locale } from "@/types"
import { cn } from "@/lib/utils"

// Inline translations (see Internationalization section)
const translations = { en: { ... }, ko: { ... } }

// Helper components scoped to this file
function HelperComponent({ ... }) { ... }

// Default export for the component
export default function ComponentName({ ... }: Props) {
  return ( ... )
}
```

### Rules

- Mark interactive components with `"use client"` on line 1.
- Use `cn()` (clsx + tailwind-merge) for conditional class names.
- Use `next/dynamic` for heavy components that are not above the fold.
- Props should be typed inline or with a named `Props` type - not exported.
- Prefer composition over configuration - split large components into focused files.

---

## Custom Hooks

**Reference:** `src/hooks/useDebateEngine.ts`, `src/hooks/useThreadPersistence.ts`

### Pattern: Extract Pure Logic for Testing

```tsx
"use client"

// 1. Export pure helper functions (top of file)
export function createMessageId(): string { ... }
export function getApiMessages(messages: Message[]): ApiMessage[] { ... }

// 2. Export reducer separately (for isolated testing)
export function reducer(state: State, action: Action): State { ... }

// 3. Export the hook
export function useHookName(config: Config) {
  const [state, dispatch] = useReducer(reducer, initialState)
  // useCallback for stable references
  // useRef for mutable state that shouldn't trigger re-renders
  return { state, dispatch, ...handlers }
}
```

### Rules

- Mark hooks with `"use client"` on line 1 (hooks use client-side React APIs like `useReducer`, `useSession`).
- Name hooks `use<Feature>` - one hook per file.
- Extract all pure logic into standalone exported functions at the top of the file.
- Export reducers so tests can exercise state transitions directly.
- Use `useCallback` for all handler functions returned by hooks.
- Use `useRef` for values that must persist across renders without triggering re-renders (session IDs, abort controllers, stop flags).
- Never throw from a hook - update state with error information instead.

---

## API Routes

**Reference:** `src/app/api/threads/route.ts`, `src/app/api/threads/[id]/messages/route.ts`

### Standard Route Structure

```tsx
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  // 1. Authenticate
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // 2. Parse and validate input
  const { field1, field2 } = await req.json()
  if (!field1 || typeof field1 !== "string") {
    return NextResponse.json({ error: "field1 is required" }, { status: 400 })
  }

  // 3. Execute business logic (with transactions if multi-table)
  try {
    const result = await prisma.$transaction(async (tx) => { ... })
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    // 4. Handle known errors with specific status codes
    if (err instanceof Error && err.message === "VERSION_CONFLICT") {
      return NextResponse.json({ error: "Version conflict" }, { status: 409 })
    }
    throw err
  }
}
```

### Rules

- Data-mutation routes (threads, messages, verdicts) must verify the session with `await auth()`. Note: the `/api/chat` and `/api/consensus` routes currently skip auth - see [Known Drift #6](#6-missing-auth-on-chatconsensus-routes-medium-priority).
- Validate all user input before processing - check types and required fields.
- Use Prisma transactions for operations spanning multiple tables.
- Return consistent error shapes: `{ error: string }` with the appropriate HTTP status.
- For thread-scoped routes, verify ownership with a helper like `verifyOwnership()`.
- Use optimistic concurrency control via version fields where race conditions are possible.

### Streaming Routes (SSE)

**Reference:** `src/app/api/chat/route.ts`

```tsx
// Helper to enqueue SSE events
function enqueueEvent(payload: object) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
}

// Stream chunks
for await (const nextChunk of streamFn(prompt, messages, signal)) {
  enqueueEvent({ chunk: nextChunk })
}

// Terminate with a done event containing the full response
enqueueEvent({ done: true, sender, displayName, content: fullContent })
```

- Use SSE (`data: ...\n\n`) format for streaming responses.
- Stream chunks as `{ chunk: string }` payloads.
- Terminate streams with a `{ done: true, sender, displayName, content }` event containing the full assembled response.
- Set `Content-Type: text/event-stream` and `Cache-Control: no-cache`.

---

## AI Provider Abstraction

**Reference:** `src/lib/providers/claude.ts`, `src/lib/providers/gpt.ts`, `src/lib/providers/gemini.ts`

### Canonical Interface

Every provider exports an async generator with this signature:

```tsx
// Naming convention: stream<ProviderName>
export async function* streamClaude(
  systemPrompt: string,
  messages: Message[],
  signal?: AbortSignal,
  maxTokens = 1024
): AsyncGenerator<string> {
  // Yield text chunks as they arrive
}
```

Concrete exports: `streamClaude()`, `streamGPT()`, `streamGemini()`, `streamPerplexity()`.

### Rules

- All providers must implement the same `(systemPrompt, messages, signal?, maxTokens?) => AsyncGenerator<string>` signature.
- Sanitize error messages to strip API keys: `msg.replace(/sk-[a-zA-Z0-9-_]+/g, "sk-***")`.
- Name streaming functions `stream<ProviderName>` (e.g. `streamClaude`, `streamGPT`).
- Map provider names to stream functions via a `getStreamFn(provider)` switch in the chat route.
- For non-streaming use cases, some providers export a `query<ProviderName>()` function (currently `queryGemini` and `queryPerplexity`). Not all providers need one.

---

## Type System

**Reference:** `src/types.ts`

### Rules

- Define all shared types in `src/types.ts` - this is the single source of truth.
- Use union literals for constrained values: `type Provider = "gemini" | "claude" | "gpt" | "perplexity"`.
- Prefer importing types with the `type` keyword: `import type { Message, Provider } from "@/types"`. Some components currently use value imports - prefer `import type` in new code.
- Module augmentations (e.g. NextAuth session extensions) go in `src/types/*.d.ts`.
- TypeScript strict mode is enabled - do not weaken it.

---

## Styling

**Reference:** `src/app/globals.css`, `src/lib/utils.ts`

### Stack

- **Tailwind CSS v4** with `@tailwindcss/postcss`
- **shadcn/ui** for base primitives (`src/components/ui/`)
- **Framer Motion** for animations
- **CSS custom properties** for theme tokens (`oklch()` color space)

### Rules

- Use Tailwind utility classes for all styling - no CSS modules, no styled-components.
- Use `cn()` from `src/lib/utils.ts` for conditional/merged class names.
- Define theme-specific colors as CSS custom properties in `globals.css` (e.g. `--color-theme-accent`).
- Reference theme tokens via Tailwind's arbitrary value syntax: `bg-[var(--user-bubble)]`.
- Use Framer Motion's `<motion.div>` for component animations. CSS `@keyframes` are acceptable for standalone decorative effects (e.g. border rotation in `globals.css`).
- Supported themes: light, dark, tokyonight, lovelace, gruvbox, catppuccin, nord, solarized.

---

## State Management

### Hierarchy

| Scope | Mechanism | Example |
|-------|-----------|---------|
| Complex UI state | `useReducer` in custom hooks | Debate engine state machine |
| Simple component state | `useState` | Input text, dropdown visibility |
| Cross-render mutable refs | `useRef` | Abort controllers, session IDs |
| Auth/session | NextAuth `useSession()` | User identity checks |
| User preferences | `localStorage` | Theme, debate count |
| Ephemeral session data | `sessionStorage` | Pending debate config |
| URL state | `useSearchParams` | Thread ID, page params |

### Rules

- No global state library (no Redux, Zustand, or Context for app state).
- Complex state flows use `useReducer` with exported reducers for testability.
- Use `localStorage` for persistent user preferences (survives sessions).
- Use `sessionStorage` for ephemeral data (cleared on tab close).
- Auth state comes exclusively from NextAuth's `useSession()`.

---

## Data Fetching

**Reference:** `src/hooks/useThreadPersistence.ts`, `src/hooks/useDebateEngine.ts`

### Rules

- Use native `fetch()` - no third-party data fetching libraries (no SWR, React Query).
- Wrap fetch calls in custom hooks with `useCallback` for stable references.
- For streaming responses, use `response.body?.getReader()` with `TextDecoder` and buffer-based SSE parsing.
- Persistence operations (save messages, save verdict) use fire-and-forget pattern - network failures are logged but do not block the UI.
- Use `AbortController` for cancellable requests; pass `signal` to fetch.
- Track optimistic concurrency with version refs when multiple tabs could edit the same resource.

---

## Database Access

**Reference:** `src/lib/prisma.ts`, `prisma/schema.prisma`

### Rules

- Use the Prisma singleton from `src/lib/prisma.ts` - never instantiate PrismaClient directly.
- The singleton uses a global cache to survive Next.js hot reloads in development.
- Use Prisma transactions (`prisma.$transaction`) for any operation touching multiple tables.
- Version fields on mutable records enable optimistic concurrency control.
- Index fields used in WHERE clauses and ORDER BY (e.g. `@@index([userId, updatedAt])`).
- Unique constraints enforce data integrity (e.g. `@@unique([threadId, orderIndex])` on messages).

---

## Authentication

**Reference:** `src/lib/auth.ts`

### Rules

- Authentication is handled by NextAuth with Google OAuth.
- Server-side: call `await auth()` to get the session in API routes.
- Client-side: use `useSession()` from `next-auth/react` wrapped in `<SessionProvider>`.
- Inject `user.id` into the session via the NextAuth `session` callback.
- Gracefully degrade when OAuth credentials are missing (log warnings, don't crash).
- Data-mutation routes must verify session ownership before processing. See [Known Drift #6](#6-missing-auth-on-chatconsensus-routes-medium-priority) for current gaps.

---

## Error Handling

### Server-side

- Wrap route handler bodies in try-catch.
- Return `{ error: string }` with appropriate HTTP status codes (400, 401, 409, 500).
- Known error conditions (e.g. VERSION_CONFLICT) get specific status codes.
- Let unknown errors propagate for framework-level handling.

### Client-side

- Errors in hooks update state rather than throwing (e.g. dispatch an error message to the UI).
- Distinguish between user-initiated aborts (AbortError) and genuine failures.
- Log errors with `console.error` for debugging.

### Provider-side

- Sanitize all error messages to strip API keys before logging or returning them.
- Pattern: `msg.replace(/sk-[a-zA-Z0-9-_]+/g, "sk-***")`.

---

## Internationalization

### Current Pattern

Translations are defined as inline objects within each component:

```tsx
const translations = {
  en: { title: "Settings", save: "Save" },
  ko: { title: "설정", save: "저장" },
}

// Usage
const t = translations[locale]
```

### Rules

- Supported locales: `en` (English), `ko` (Korean).
- Locale is passed as a prop of type `Locale` from `src/types.ts`.
- Translation objects are defined per-component (no centralized i18n library).
- Every user-facing string must have both `en` and `ko` entries.

---

## Testing

**Reference:** `src/__tests__/debate-engine.test.ts`, `src/__tests__/clean-response.test.ts`

### Stack

- **Vitest** as the test runner.
- Tests live in `src/__tests__/` with the `.test.ts` extension.
- Path aliases (`@/`) are mirrored in `vitest.config.ts`.

### Patterns

```tsx
import { describe, it, expect } from "vitest"
import { functionUnderTest } from "@/path/to/module"

describe("functionUnderTest", () => {
  it("should handle the happy path", () => {
    expect(functionUnderTest(input)).toBe(expected)
  })
})
```

### Rules

- Test pure functions and reducers directly - they're exported specifically for this purpose.
- Use factory functions (e.g. `makeState()`) to construct test fixtures.
- Test file names must mirror the module they test: `debate-engine.test.ts` tests `useDebateEngine.ts`.
- Run tests with `npm test` (mapped to `vitest run`).
- CI runs lint, typecheck, test, and build via GitHub Actions.

---

## Configuration

### Environment Variables

Defined in `.env.example`:

| Variable | Purpose |
|----------|---------|
| `VERTEX_PROJECT_ID` | Google Cloud project for Gemini |
| `VERTEX_LOCATION` | Vertex AI region |
| `PERPLEXITY_API_KEY` | Perplexity API access |
| `ANTHROPIC_API_KEY` | Claude API access |
| `OPENAI_API_KEY` | GPT API access |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth session encryption |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | GCP service account (optional, used in code but not yet in `.env.example`) |

### Rules

- Access environment variables via `process.env` in server-side code only.
- For critical variables, use a validation helper like `getRequiredEnv()` that throws on missing values.
- Never expose API keys to the client - all AI API calls happen server-side.
- Document new environment variables in `.env.example`.

### Build Pipeline

```
node scripts/write-env.js && prisma generate && next build
```

- `write-env.js` writes environment config before build.
- Prisma client is generated before Next.js build.
- CI pipeline: lint -> typecheck -> test -> build.

---

## Known Drift and Remediation

The patterns above represent the target state. The following inconsistencies exist and should be addressed:

### 1. Translation Duplication (Medium Priority)

**Current state:** Translation objects are copy-pasted across 6 components (Header, MessageInput, SummaryCard, SettingsModal, ConsensusMeter, WelcomeHero).

**Impact:** Adding a new locale or updating a string requires touching every component.

**Remediation:** Extract translations to `src/i18n/translations.ts` keyed by component name, or adopt a lightweight i18n library.

### 2. Icon Component Duplication (Low Priority)

**Current state:** `ModelIcon()` components with identical switch statements exist in three files: `ChatBubble.tsx`, `SettingsModal.tsx`, and `WelcomeHero.tsx`.

**Impact:** Adding a new AI model requires updating three separate icon switch statements.

**Remediation:** Extract to `src/components/ModelIcon.tsx` as a shared component.

### 3. No API Route Tests (Medium Priority)

**Current state:** All 7 test files cover utilities and hooks. API routes (`/api/chat`, `/api/consensus`, `/api/threads`) have zero test coverage.

**Impact:** Critical business logic (auth, validation, concurrency control) is only validated manually.

**Remediation:** Add integration tests for API routes using Vitest with mocked Prisma and auth.

### 4. Console-Only Error Logging (Low Priority)

**Current state:** All client-side errors are logged with `console.error()`. No structured logging or error tracking service.

**Impact:** Production errors are invisible unless a user reports them.

**Remediation:** Add a lightweight error logging utility in `src/lib/logger.ts` that can be wired to a service when needed.

### 5. Inconsistent Environment Variable Access (Low Priority)

**Current state:** Vertex config uses a centralized `getRequiredEnv()` helper. Other providers access `process.env` directly.

**Impact:** Missing API keys surface as opaque runtime errors instead of clear startup messages.

**Remediation:** Route all provider env access through a validated config module.

### 6. Missing Auth on Chat/Consensus Routes (Medium Priority)

**Current state:** The `/api/chat` and `/api/consensus` routes do not call `await auth()`. All other mutating routes (threads, messages, verdicts) verify the session.

**Impact:** Unauthenticated users can invoke AI provider calls, which consume API credits.

**Remediation:** Add `await auth()` checks to both routes, consistent with the thread routes pattern.
