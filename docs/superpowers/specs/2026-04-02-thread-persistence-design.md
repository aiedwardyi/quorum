# Thread Persistence + History Design Spec

## Context

Quorum debates are currently in-memory only - lost on refresh or navigation. Users can't return to prior debates, which limits the product's value as a decision-making tool. This spec covers session persistence, thread history, and user authentication as the foundation for v3.

The design is built to be implemented incrementally (3 chunks) while targeting the full v3 architecture from day one - no throwaway work.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | PostgreSQL on Neon | Serverless, scales to zero, works with Next.js serverless functions |
| ORM | Prisma | Type-safe, auto-generated client, migration system, NextAuth adapter |
| Auth | NextAuth.js v5 + Google OAuth | De facto Next.js auth standard, Prisma adapter built-in |
| History UI | Title dropdown switcher | Most minimal, mobile-friendly, same component on all breakpoints |
| Save behavior | Auto-save (background) | No save button needed, threads persist as debate progresses |
| Login gate | First debate free, login required for 2nd+ | localStorage counter (`quorum_debate_count`), tunable via `FREE_DEBATE_LIMIT` constant |
| Identity | Real auth from day one | No anonymous-to-authenticated migration needed |

## Database Schema

### User (NextAuth managed)

Standard NextAuth tables: User, Account, Session, VerificationToken. No custom fields needed for this chunk.

### Thread

| Column | Type | Notes |
|--------|------|-------|
| id | String @cuid | Primary key |
| title | String | First ~80 chars of the initial prompt |
| userId | String | FK to User |
| models | String[] | Providers used (e.g. ["gemini", "claude", "gpt"]) |
| rounds | Int | Number of debate rounds |
| responseLength | String | "short" / "medium" / "long" |
| locale | String | "en" / "ko" |
| status | Enum | "active" / "complete" |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Relations: hasMany Message, hasMany Verdict, belongsTo User

### Message

| Column | Type | Notes |
|--------|------|-------|
| id | String @cuid | Primary key |
| threadId | String | FK to Thread |
| sender | String | Provider name, "user", "system", or "verdict" |
| displayName | String | "Gemini", "Claude", "You", etc. |
| content | Text | Full message content |
| orderIndex | Int | Guarantees correct replay order |
| createdAt | DateTime | Auto |

Relations: belongsTo Thread

### Verdict

Separate table because continue-thread can produce multiple verdicts per thread.

| Column | Type | Notes |
|--------|------|-------|
| id | String @cuid | Primary key |
| threadId | String | FK to Thread |
| recommendation | String | Max 15 words, action-oriented |
| voteSplit | String | "3/4 models agree" format |
| confidence | Int | 0-100 |
| reasons | String[] | 2-4 bullet points |
| minorityView | String | Strongest counterargument |
| oppositeCase | String | When to ignore this recommendation |
| createdAt | DateTime | Auto |

Relations: belongsTo Thread

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | /api/threads | Create thread on debate start |
| GET | /api/threads | List user's threads (paginated, for dropdown) |
| GET | /api/threads/:id | Full thread with messages + verdicts |
| PATCH | /api/threads/:id | Update status, title |
| DELETE | /api/threads/:id | Delete thread |
| POST | /api/threads/:id/messages | Batch save messages after round |
| POST | /api/threads/:id/verdicts | Save verdict |
| GET/POST | /api/auth/* | NextAuth routes (auto-generated) |

All thread routes require authentication (NextAuth session check). Threads are scoped to the authenticated user - no cross-user access.

## User Flow

### First Visit (no login)

1. Land on homepage
2. Pick models, type question, send
3. Full debate runs (all rounds), verdict displayed
4. Thread lives in memory only - lost on refresh
5. `quorum_debate_count` incremented in localStorage

### Second Debate Attempt

1. User starts new debate (homepage or /chat)
2. `quorum_debate_count >= FREE_DEBATE_LIMIT` triggers login gate
3. Modal: "Sign in to keep debating and save your threads" + Google button
4. On success: debate proceeds, thread auto-saves to DB
5. Title dropdown now shows history

### Returning User

1. Already logged in (session cookie persists)
2. Title dropdown shows past threads with verdict previews
3. Click thread to reopen - full message history + verdicts restored
4. Can continue the debate (new messages appended, new verdict possible)
5. New debates auto-save automatically

## Auto-Save Strategy

Saves happen in the background - no loading states visible to the user. If a save fails, the debate continues normally (client state is primary, DB is backup).

1. **User sends prompt** - CREATE thread (title = first ~80 chars of prompt)
2. **Each round completes** - BATCH SAVE messages for that round
3. **Verdict generated** - SAVE verdict + mark thread status "complete"
4. **Continue thread** - APPEND new messages + set status back to "active"
5. **New verdict** - SAVE as additional verdict record

## Login Gate

- **Tracked via:** `localStorage['quorum_debate_count']`
- **Threshold:** `FREE_DEBATE_LIMIT` constant (default: 1)
- **Trigger point:** Homepage, when user clicks "Send" for 2nd+ debate
- **Counter increment:** After verdict is delivered, NOT on debate start. Prevents users from "losing" their free trial to a refresh or timeout mid-debate.
- **Bypass-proof?** No (localStorage can be cleared). Intentional - the gate is a nudge, not a paywall. Real cost protection comes with the credits system later.
- **Tunable:** Change `FREE_DEBATE_LIMIT` to 0 (always require login) or higher (more generous free tier) - one-line change.
- **Prompt preservation:** Before OAuth redirect, save the pending prompt + selected config to `sessionStorage['quorum_pending']`. On OAuth callback return, restore and auto-submit.

## History UI: Title Dropdown

- Thread title displayed in the chat page header
- Clicking the title opens a dropdown popover
- Dropdown contains: search input + list of past threads
- Each thread shows: title, verdict preview (recommendation + confidence), relative time
- Active thread highlighted
- "+ New" button to start fresh debate
- Click outside to dismiss
- Same component on desktop and mobile (popover stretches full-width on mobile)

## Thread Rehydration

When user clicks a thread from the dropdown:

1. Fetch full thread from `GET /api/threads/:id` (messages + verdicts + config)
2. Navigate to `/chat` (or stay if already there)
3. Hydrate `useDebateEngine` state: restore messages array, verdict data, round count, model list
4. Set `showSummary` if thread status is "complete"
5. User can continue the debate from where they left off

## Key Files to Modify

- `src/hooks/useDebateEngine.ts` - add auto-save calls, hydration from DB
- `src/app/chat/page.tsx` - integrate title dropdown, thread switching
- `src/app/page.tsx` - add login gate check on send
- `src/components/Header.tsx` - replace cosmetic login with real auth
- `src/types.ts` - may need minor updates for thread/session types

## New Files

- `prisma/schema.prisma` - database schema
- `src/lib/auth.ts` - NextAuth config (Google provider, Prisma adapter)
- `src/app/api/auth/[...nextauth]/route.ts` - NextAuth route handler
- `src/app/api/threads/route.ts` - thread list + create
- `src/app/api/threads/[id]/route.ts` - thread get + update + delete
- `src/app/api/threads/[id]/messages/route.ts` - batch message save
- `src/app/api/threads/[id]/verdicts/route.ts` - verdict save
- `src/components/ThreadDropdown.tsx` - history dropdown component
- `src/components/LoginGate.tsx` - login modal component
- `src/lib/prisma.ts` - Prisma client singleton

## Implementation Chunks

### Chunk 1: Foundation
- Prisma schema + Neon database setup
- NextAuth v5 + Google OAuth configuration
- Login gate (FREE_DEBATE_LIMIT + localStorage counter)
- Replace cosmetic login button with real auth

### Chunk 2: Persistence
- Thread CRUD API routes
- Auto-save hooks in useDebateEngine
- Background save (fire-and-forget)
- Thread rehydration from DB

### Chunk 3: History UI
- Title dropdown component
- Thread list with search
- Verdict preview in list items
- Thread delete

## Edge Cases - Addressed

### 1. Counter timing
**Problem:** If `quorum_debate_count` increments when a debate starts, a user who refreshes mid-debate loses their free trial without ever seeing a verdict.
**Fix:** Increment the counter only after the verdict is successfully displayed. If the debate is interrupted (refresh, stop, timeout), the counter stays the same.

### 2. Prompt preservation across OAuth
**Problem:** User types a prompt, hits Send, login gate appears, Google OAuth redirects the page. On return, the prompt is gone (React state lost).
**Fix:** Before triggering OAuth, save `{ prompt, models, responseLength, rounds, locale }` to `sessionStorage['quorum_pending']`. On the OAuth callback page, check for this key. If present, restore the config and auto-navigate to `/chat` to start the debate.

### 3. Failed save recovery
**Problem:** If a round's save request fails (network blip), only that round's messages are lost. Subsequent rounds save fine, creating gaps in the DB. Reopened thread has missing messages.
**Fix:** Maintain a `lastSavedIndex` ref in useDebateEngine. On each save attempt, send ALL messages from `lastSavedIndex + 1` to current, not just the latest round. Use `ON CONFLICT DO NOTHING` (or Prisma's `skipDuplicates`) so re-sending already-saved messages is harmless. Only advance `lastSavedIndex` on successful save.

### 4. Concurrent tab writes
**Problem:** Two tabs open the same thread and both send "continue." Messages from both continuations interleave in the DB, corrupting the thread.
**Fix:** Add a `version` Int field on Thread. Every write (message save, verdict save, status update) must include the expected version. Server increments version on success, rejects stale writes with 409 Conflict. Client shows "This thread was updated in another tab - reload to see latest."

## Edge Cases - Deferred (Known Limitations)

- **Orphaned active threads:** If user refreshes mid-debate while logged in, an "active" thread with partial messages exists in DB. Acceptable - shows in history, user can delete or ignore. No resume-mid-debate support in v3.
- **Stale dropdown across tabs:** Tab A won't see Tab B's new thread until dropdown is reopened (re-fetches on open). Acceptable.
- **Session expiry mid-debate:** If NextAuth session expires during a long debate, auto-save fails silently. Extremely rare. Debate continues in-memory.
- **Mixed locale on continue-thread:** Use the thread's original locale for continuation prompts. UI chrome follows current session locale.
- **Verdict-to-message mapping:** Store `afterMessageIndex` on Verdict (the orderIndex of the last message before this verdict) to precisely link verdicts to their position in the thread.

## Schema Additions (from edge case fixes)

Add to Thread table:
- `version` Int (default: 0) - optimistic locking counter

Add to Verdict table:
- `afterMessageIndex` Int - orderIndex of the last message before this verdict

## Verification

1. **Auth flow:** Sign in with Google, verify session persists across refresh
2. **First-free gate:** First debate works without login, second attempt shows login modal
3. **Auto-save:** Start a debate, check DB has thread + messages after each round
4. **Verdict save:** Complete a debate, verify verdict record in DB
5. **History dropdown:** Click title, see past threads with verdict previews
6. **Thread reopen:** Click a past thread, verify all messages + verdict restore correctly
7. **Continue thread:** Reopen a completed thread, send follow-up, verify new messages + verdict append
8. **Mobile:** Test title dropdown on mobile viewport - should work identically
9. **Counter timing:** Start free debate, refresh mid-round, verify counter didn't increment - can start another free debate
10. **Prompt preservation:** Trigger login gate, complete OAuth, verify prompt auto-submits on return
11. **Concurrent tabs:** Open same thread in two tabs, continue in both, verify second tab gets 409 and shows reload message
12. **Failed save recovery:** Simulate network failure mid-debate (devtools offline), reconnect, verify next save catches up all missed messages
