# Thread Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist debate threads to a database so users can return to prior debates, with Google OAuth login and a thread history dropdown.

**Architecture:** PostgreSQL on Neon via Prisma ORM for persistence. NextAuth.js v5 with Google OAuth for authentication. Auto-save is fire-and-forget from useDebateEngine hooks. Thread history via a title dropdown in the chat header. Login gate uses localStorage counter - first debate is free, 2nd+ requires sign-in.

**Tech Stack:** Prisma, @auth/nextjs (NextAuth v5), @auth/prisma-adapter, Neon PostgreSQL, Next.js 16 App Router

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | Database schema (NextAuth tables + Thread + Message + Verdict) |
| `src/lib/prisma.ts` | Prisma client singleton (avoid multiple instances in dev) |
| `src/lib/auth.ts` | NextAuth v5 configuration (Google provider, Prisma adapter) |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth route handler (GET + POST) |
| `src/app/api/threads/route.ts` | POST (create thread), GET (list user threads) |
| `src/app/api/threads/[id]/route.ts` | GET (full thread), PATCH (update), DELETE |
| `src/app/api/threads/[id]/messages/route.ts` | POST (batch save messages) |
| `src/app/api/threads/[id]/verdicts/route.ts` | POST (save verdict) |
| `src/components/ThreadDropdown.tsx` | History dropdown with search + verdict previews |
| `src/components/LoginGate.tsx` | Login modal for free-tier gate |
| `src/hooks/useThreadPersistence.ts` | Auto-save logic extracted from useDebateEngine |
| `src/__tests__/thread-persistence.test.ts` | Tests for persistence hook logic |
| `src/__tests__/login-gate.test.ts` | Tests for login gate counter logic |

### Modified Files

| File | Changes |
|------|---------|
| `src/types.ts` | Add `ThreadSummary` type for dropdown list items |
| `src/hooks/useDebateEngine.ts` | Add `threadId` to state, dispatch save callbacks, expose hydration action |
| `src/app/chat/page.tsx` | Integrate ThreadDropdown, useThreadPersistence, auth session, thread switching |
| `src/app/page.tsx` | Add login gate check on send, increment debate counter after verdict |
| `src/components/Header.tsx` | Replace mock auth with NextAuth session, add thread title area |
| `src/app/layout.tsx` | Wrap with SessionProvider |
| `package.json` | Add prisma, @auth/nextjs, @auth/prisma-adapter dependencies |

---

## Chunk 1: Foundation (Prisma + Neon + NextAuth + Login Gate)

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install production dependencies**

Run:
```bash
npm install next-auth@beta @auth/prisma-adapter prisma @prisma/client
```

- [ ] **Step 2: Verify installation**

Run: `npx prisma --version`
Expected: Prisma CLI version output (e.g., `prisma : 6.x.x`)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add prisma, next-auth, and auth adapter dependencies"
```

---

### Task 2: Prisma Schema + Database Setup

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/prisma.ts`

- [ ] **Step 1: Create the Prisma schema**

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ---- NextAuth tables ----

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
  threads       Thread[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ---- Quorum tables ----

enum ThreadStatus {
  active
  complete
}

model Thread {
  id             String       @id @default(cuid())
  title          String
  userId         String
  models         String[]
  rounds         Int
  responseLength String
  locale         String       @default("en")
  status         ThreadStatus @default(active)
  version        Int          @default(0)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages DBMessage[]
  verdicts Verdict[]

  @@index([userId, updatedAt])
}

model DBMessage {
  id         String   @id @default(cuid())
  threadId   String
  sender     String
  displayName String
  content    String   @db.Text
  orderIndex Int
  createdAt  DateTime @default(now())

  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@unique([threadId, orderIndex])
  @@index([threadId])
}

model Verdict {
  id                String   @id @default(cuid())
  threadId          String
  recommendation    String
  voteSplit         String
  confidence        Int
  reasons           String[]
  minorityView      String   @db.Text
  oppositeCase      String   @db.Text
  afterMessageIndex Int
  createdAt         DateTime @default(now())

  thread Thread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId])
}
```

- [ ] **Step 2: Create Prisma client singleton**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

- [ ] **Step 3: Add DATABASE_URL to environment**

Add to `.env.local`:
```
DATABASE_URL="postgresql://..."
```

The user needs to create a Neon database and paste the connection string. The format is:
```
postgresql://<user>:<password>@<host>.neon.tech/<dbname>?sslmode=require
```

- [ ] **Step 4: Generate Prisma client and push schema**

Run:
```bash
npx prisma generate
npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 5: Verify with Prisma Studio**

Run: `npx prisma studio`
Expected: Browser opens showing all tables (User, Account, Session, VerificationToken, Thread, DBMessage, Verdict) with zero rows.

- [ ] **Step 6: Add prisma output to .gitignore if not present**

Check if `.gitignore` has `prisma/*.db` or similar. No action needed for Neon (remote DB), but ensure `.env.local` is gitignored.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/lib/prisma.ts
git commit -m "feat: add prisma schema with NextAuth and Quorum tables"
```

---

### Task 3: NextAuth v5 Configuration

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create NextAuth configuration**

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/", // Redirect to homepage for sign-in
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      return session
    },
  },
})
```

- [ ] **Step 2: Create NextAuth route handler**

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth"

export const { GET, POST } = handlers
```

- [ ] **Step 3: Add Google OAuth env vars**

Add to `.env.local`:
```
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
AUTH_SECRET="..."
```

The user needs to:
1. Go to Google Cloud Console > APIs & Services > Credentials
2. Create an OAuth 2.0 client ID (Web application)
3. Set authorized redirect URI to `http://localhost:3000/api/auth/callback/google`
4. Generate AUTH_SECRET with: `npx auth secret`

- [ ] **Step 4: Wrap layout with SessionProvider**

Modify `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quorum | AI Group Chat",
  description: "Multi-AI group chat for consensus",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Test auth flow**

Run: `npm run dev`

1. Navigate to `http://localhost:3000/api/auth/signin`
2. Click "Sign in with Google"
3. Complete OAuth flow
4. Verify redirect back to homepage
5. Check `http://localhost:3000/api/auth/session` returns user data

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/app/api/auth/\[...nextauth\]/route.ts src/app/layout.tsx
git commit -m "feat: configure NextAuth v5 with Google OAuth and Prisma adapter"
```

---

### Task 4: Wire Real Auth into Header

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Update Header to accept session data**

Replace the `isLoggedIn`, `onLogin`, `onLogout` props in `src/components/Header.tsx` with session-based auth:

```typescript
// At the top of Header.tsx, add:
import { useSession, signIn, signOut } from "next-auth/react"
```

Replace the existing prop types - remove `isLoggedIn`, `onLogin`, `onLogout`. Instead, use `useSession()` inside the component:

```typescript
export default function ChatHeader({
  currentRound,
  maxRounds,
  responseLength,
  onChangeResponseLength,
  locale,
  theme,
  onToggleTheme,
  onOpenSettings,
  isDebating = false,
}: {
  currentRound: number
  maxRounds: number
  responseLength: ResponseLength
  onChangeResponseLength: (length: ResponseLength) => void
  locale: Locale
  theme: Theme
  onToggleTheme: () => void
  onOpenSettings: () => void
  isDebating?: boolean
}) {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
```

Update the login/logout button handlers in the JSX:
- Login button `onClick`: `() => signIn("google")`
- Logout button `onClick`: `() => signOut()`
- User display name: `session?.user?.name`
- User avatar: `session?.user?.image`

- [ ] **Step 2: Update chat page to remove mock auth props**

In `src/app/chat/page.tsx`, remove:
- `const [isLoggedIn, setIsLoggedIn] = useState(true)` state
- `isLoggedIn={isLoggedIn}` prop from `<ChatHeader>`
- `onLogin={() => setIsLoggedIn(true)}` prop
- `onLogout={() => setIsLoggedIn(false)}` prop

The ChatHeader now gets auth state internally via `useSession()`.

- [ ] **Step 3: Test**

Run: `npm run dev`
1. Visit `/chat` while signed out - should see "Log In" button
2. Click Log In - Google OAuth flow
3. After sign-in - should see user name/avatar and "Sign Out" option
4. Click Sign Out - should revert to "Log In" button

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx src/app/chat/page.tsx
git commit -m "feat: replace mock auth with NextAuth session in header"
```

---

### Task 5: Login Gate Component + Logic

**Files:**
- Create: `src/components/LoginGate.tsx`
- Create: `src/__tests__/login-gate.test.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Write tests for login gate counter logic**

```typescript
// src/__tests__/login-gate.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest"

// Test pure logic - no React components
import {
  getDebateCount,
  incrementDebateCount,
  shouldShowLoginGate,
  FREE_DEBATE_LIMIT,
  savePendingDebate,
  loadPendingDebate,
} from "@/components/LoginGate"

// Mock localStorage and sessionStorage
const localStore: Record<string, string> = {}
const sessionStore: Record<string, string> = {}

beforeEach(() => {
  Object.keys(localStore).forEach((k) => delete localStore[k])
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k])

  vi.stubGlobal("localStorage", {
    getItem: (k: string) => localStore[k] ?? null,
    setItem: (k: string, v: string) => { localStore[k] = v },
    removeItem: (k: string) => { delete localStore[k] },
  })
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => sessionStore[k] ?? null,
    setItem: (k: string, v: string) => { sessionStore[k] = v },
    removeItem: (k: string) => { delete sessionStore[k] },
  })
})

describe("getDebateCount", () => {
  it("returns 0 when no counter exists", () => {
    expect(getDebateCount()).toBe(0)
  })

  it("returns stored count", () => {
    localStore["quorum_debate_count"] = "3"
    expect(getDebateCount()).toBe(3)
  })

  it("returns 0 for malformed value", () => {
    localStore["quorum_debate_count"] = "abc"
    expect(getDebateCount()).toBe(0)
  })
})

describe("incrementDebateCount", () => {
  it("increments from 0 to 1", () => {
    incrementDebateCount()
    expect(localStore["quorum_debate_count"]).toBe("1")
  })

  it("increments from existing value", () => {
    localStore["quorum_debate_count"] = "2"
    incrementDebateCount()
    expect(localStore["quorum_debate_count"]).toBe("3")
  })
})

describe("shouldShowLoginGate", () => {
  it("returns false when count < limit and not logged in", () => {
    expect(shouldShowLoginGate(false)).toBe(false)
  })

  it("returns true when count >= limit and not logged in", () => {
    localStore["quorum_debate_count"] = String(FREE_DEBATE_LIMIT)
    expect(shouldShowLoginGate(false)).toBe(true)
  })

  it("returns false when logged in regardless of count", () => {
    localStore["quorum_debate_count"] = "100"
    expect(shouldShowLoginGate(true)).toBe(false)
  })
})

describe("savePendingDebate / loadPendingDebate", () => {
  it("round-trips pending debate config", () => {
    const config = {
      prompt: "test prompt",
      models: ["gemini", "claude"] as const,
      responseLength: "medium" as const,
      rounds: 5,
      locale: "en" as const,
    }
    savePendingDebate(config)
    const loaded = loadPendingDebate()
    expect(loaded).toEqual(config)
  })

  it("returns null when no pending debate", () => {
    expect(loadPendingDebate()).toBeNull()
  })

  it("clears pending debate after loading", () => {
    savePendingDebate({ prompt: "test", models: ["gemini"], responseLength: "short", rounds: 3, locale: "en" })
    loadPendingDebate()
    expect(loadPendingDebate()).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/login-gate.test.ts`
Expected: FAIL - module `@/components/LoginGate` not found

- [ ] **Step 3: Create LoginGate component with exported logic**

```typescript
// src/components/LoginGate.tsx
"use client"

import { signIn } from "next-auth/react"
import { X } from "lucide-react"
import type { Provider, ResponseLength, Locale } from "@/types"

// ---- Constants ----

export const FREE_DEBATE_LIMIT = 1
const STORAGE_KEY = "quorum_debate_count"
const PENDING_KEY = "quorum_pending"

// ---- Pure logic (exported for testing) ----

export function getDebateCount(): number {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return isNaN(n) ? 0 : n
}

export function incrementDebateCount(): void {
  localStorage.setItem(STORAGE_KEY, String(getDebateCount() + 1))
}

export function shouldShowLoginGate(isLoggedIn: boolean): boolean {
  if (isLoggedIn) return false
  return getDebateCount() >= FREE_DEBATE_LIMIT
}

type PendingDebate = {
  prompt: string
  models: string[]
  responseLength: string
  rounds: number
  locale: string
}

export function savePendingDebate(config: PendingDebate): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(config))
}

export function loadPendingDebate(): PendingDebate | null {
  const raw = sessionStorage.getItem(PENDING_KEY)
  if (!raw) return null
  sessionStorage.removeItem(PENDING_KEY)
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ---- Component ----

export default function LoginGateModal({
  onClose,
  locale,
}: {
  onClose: () => void
  locale: Locale
}) {
  const t = locale === "ko"
    ? { title: "계속하려면 로그인하세요", desc: "토론을 저장하고 이어서 진행하려면 Google로 로그인하세요.", button: "Google로 로그인" }
    : { title: "Sign in to continue", desc: "Log in with Google to save your debates and keep the conversation going.", button: "Sign in with Google" }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">{t.title}</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">{t.desc}</p>

        <button
          onClick={() => signIn("google")}
          className="w-full flex items-center justify-center gap-2 bg-white text-gray-800 font-medium py-2.5 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {t.button}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/login-gate.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Integrate login gate into homepage**

In `src/app/page.tsx`, add the login gate check in the send handler. The homepage already has a send function that stores config to sessionStorage and navigates to `/chat`. Wrap that logic:

1. Import `useSession` from `next-auth/react`
2. Import `shouldShowLoginGate`, `savePendingDebate`, `LoginGateModal` from `@/components/LoginGate`
3. Add `const { data: session } = useSession()` and `const [showGate, setShowGate] = useState(false)`
4. In the send handler, before navigating to `/chat`, check:
   ```typescript
   if (shouldShowLoginGate(!!session?.user)) {
     savePendingDebate({ prompt: topic, models: selectedModels, responseLength, rounds: maxRounds, locale })
     setShowGate(true)
     return
   }
   ```
5. Render `{showGate && <LoginGateModal onClose={() => setShowGate(false)} locale={locale} />}` in the JSX

- [ ] **Step 6: Handle pending debate on OAuth return**

In `src/app/chat/page.tsx`, in the config hydration `useEffect`, add a check for `quorum_pending` in sessionStorage (from the login gate). If found, use it like the existing `quorum_config`:

```typescript
// After existing quorum_config check, add:
const pending = sessionStorage.getItem("quorum_pending")
if (pending) {
  sessionStorage.removeItem("quorum_pending")
  try {
    const config = JSON.parse(pending)
    if (config.models?.length) dispatch({ type: "SET_MODELS", models: config.models })
    if (config.responseLength) setResponseLength(config.responseLength)
    if (config.rounds) setMaxRounds(config.rounds)
    if (config.locale) setLocale(config.locale)
    if (config.prompt) {
      pendingPrompt.current = {
        prompt: config.prompt,
        models: config.models ?? DEFAULT_MODELS,
      }
    }
  } catch { /* ignore */ }
}
```

- [ ] **Step 7: Test the login gate flow**

Run: `npm run dev`
1. Open incognito window, go to homepage
2. Start first debate - should proceed normally (no gate)
3. After verdict, manually set `localStorage.quorum_debate_count = "1"` in devtools
4. Try to start second debate - login gate modal should appear
5. Click "Sign in with Google" - OAuth flow
6. After return, verify prompt auto-submits and debate starts

- [ ] **Step 8: Commit**

```bash
git add src/components/LoginGate.tsx src/__tests__/login-gate.test.ts src/app/page.tsx src/app/chat/page.tsx
git commit -m "feat: add login gate - first debate free, 2nd+ requires Google sign-in"
```

---

## Chunk 2: Persistence (Thread CRUD + Auto-Save + Rehydration)

### Task 6: Thread API Routes

**Files:**
- Create: `src/app/api/threads/route.ts`
- Create: `src/app/api/threads/[id]/route.ts`
- Create: `src/app/api/threads/[id]/messages/route.ts`
- Create: `src/app/api/threads/[id]/verdicts/route.ts`

- [ ] **Step 1: Create auth helper for API routes**

Add a helper to `src/lib/auth.ts` for protecting API routes:

```typescript
// Add to bottom of src/lib/auth.ts
import { NextRequest, NextResponse } from "next/server"

export async function getAuthenticatedUser(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user
}
```

- [ ] **Step 2: Create thread list + create route**

```typescript
// src/app/api/threads/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get("cursor")
  const search = searchParams.get("q")
  const take = 20

  const threads = await prisma.thread.findMany({
    where: {
      userId: session.user.id,
      ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      title: true,
      models: true,
      status: true,
      updatedAt: true,
      verdicts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          recommendation: true,
          confidence: true,
        },
      },
    },
  })

  const hasMore = threads.length > take
  const items = hasMore ? threads.slice(0, take) : threads
  const nextCursor = hasMore ? items[items.length - 1].id : null

  return NextResponse.json({ threads: items, nextCursor })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { title, models, rounds, responseLength, locale } = body

  const thread = await prisma.thread.create({
    data: {
      title: String(title).slice(0, 80),
      userId: session.user.id,
      models,
      rounds,
      responseLength,
      locale: locale || "en",
    },
  })

  return NextResponse.json(thread, { status: 201 })
}
```

- [ ] **Step 3: Create thread detail route (GET, PATCH, DELETE)**

```typescript
// src/app/api/threads/[id]/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

async function verifyOwnership(threadId: string, userId: string) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: { userId: true },
  })
  return thread?.userId === userId
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!(await verifyOwnership(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const thread = await prisma.thread.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { orderIndex: "asc" } },
      verdicts: { orderBy: { createdAt: "asc" } },
    },
  })

  return NextResponse.json(thread)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!(await verifyOwnership(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const { status, title, expectedVersion } = body

  // Optimistic locking
  if (typeof expectedVersion === "number") {
    const current = await prisma.thread.findUnique({
      where: { id },
      select: { version: true },
    })
    if (current && current.version !== expectedVersion) {
      return NextResponse.json(
        { error: "Thread was updated in another tab. Reload to see latest." },
        { status: 409 }
      )
    }
  }

  const thread = await prisma.thread.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(title ? { title: String(title).slice(0, 80) } : {}),
      version: { increment: 1 },
    },
  })

  return NextResponse.json(thread)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  if (!(await verifyOwnership(id, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.thread.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create batch message save route**

```typescript
// src/app/api/threads/[id]/messages/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  // Verify ownership
  const thread = await prisma.thread.findUnique({
    where: { id },
    select: { userId: true, version: true },
  })
  if (thread?.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { messages, expectedVersion } = await req.json()

  // Optimistic locking
  if (typeof expectedVersion === "number" && thread.version !== expectedVersion) {
    return NextResponse.json(
      { error: "Thread was updated in another tab. Reload to see latest." },
      { status: 409 }
    )
  }

  // Batch upsert with skipDuplicates (idempotent - safe to re-send)
  await prisma.$transaction([
    prisma.dBMessage.createMany({
      data: messages.map((m: { sender: string; displayName: string; content: string; orderIndex: number }) => ({
        threadId: id,
        sender: m.sender,
        displayName: m.displayName,
        content: m.content,
        orderIndex: m.orderIndex,
      })),
      skipDuplicates: true,
    }),
    prisma.thread.update({
      where: { id },
      data: { version: { increment: 1 } },
    }),
  ])

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create verdict save route**

```typescript
// src/app/api/threads/[id]/verdicts/route.ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const thread = await prisma.thread.findUnique({
    where: { id },
    select: { userId: true },
  })
  if (thread?.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await req.json()
  const { recommendation, voteSplit, confidence, reasons, minorityView, oppositeCase, afterMessageIndex } = body

  const [verdict] = await prisma.$transaction([
    prisma.verdict.create({
      data: {
        threadId: id,
        recommendation,
        voteSplit,
        confidence,
        reasons,
        minorityView,
        oppositeCase,
        afterMessageIndex: afterMessageIndex ?? 0,
      },
    }),
    prisma.thread.update({
      where: { id },
      data: { status: "complete", version: { increment: 1 } },
    }),
  ])

  return NextResponse.json(verdict, { status: 201 })
}
```

- [ ] **Step 6: Manually test API routes with curl**

Run: `npm run dev`

```bash
# Get session cookie first (sign in via browser, copy cookie)
# Create thread:
curl -X POST http://localhost:3000/api/threads \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"title":"Test thread","models":["gemini","perplexity"],"rounds":5,"responseLength":"medium"}'

# List threads:
curl http://localhost:3000/api/threads -H "Cookie: <session-cookie>"

# Should see the created thread in the list
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/threads/ src/lib/auth.ts
git commit -m "feat: add thread CRUD API routes with auth and optimistic locking"
```

---

### Task 7: Thread Persistence Hook

**Files:**
- Create: `src/hooks/useThreadPersistence.ts`
- Create: `src/__tests__/thread-persistence.test.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Add ThreadSummary type**

Add to `src/types.ts`:

```typescript
export type ThreadSummary = {
  id: string
  title: string
  models: string[]
  status: "active" | "complete"
  updatedAt: string
  verdicts: {
    recommendation: string
    confidence: number
  }[]
}
```

- [ ] **Step 2: Write tests for persistence hook logic**

```typescript
// src/__tests__/thread-persistence.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  buildSaveMessages,
  shouldAutoSave,
} from "@/hooks/useThreadPersistence"
import type { Message } from "@/types"

const makeMsg = (sender: string, content: string, index: number): Message => ({
  id: `${sender}-${index}`,
  sender: sender as Message["sender"],
  displayName: sender,
  content,
  timestamp: new Date(),
})

describe("buildSaveMessages", () => {
  it("maps messages to DB format with orderIndex starting from offset", () => {
    const msgs = [
      makeMsg("user", "hello", 0),
      makeMsg("gemini", "hi there", 1),
    ]
    const result = buildSaveMessages(msgs, 0)
    expect(result).toEqual([
      { sender: "user", displayName: "user", content: "hello", orderIndex: 0 },
      { sender: "gemini", displayName: "gemini", content: "hi there", orderIndex: 1 },
    ])
  })

  it("applies offset for incremental saves", () => {
    const msgs = [makeMsg("claude", "response", 0)]
    const result = buildSaveMessages(msgs, 5)
    expect(result).toEqual([
      { sender: "claude", displayName: "claude", content: "response", orderIndex: 5 },
    ])
  })

  it("returns empty array for empty input", () => {
    expect(buildSaveMessages([], 0)).toEqual([])
  })
})

describe("shouldAutoSave", () => {
  it("returns false when not logged in", () => {
    expect(shouldAutoSave(false, null)).toBe(false)
  })

  it("returns false when no thread id", () => {
    expect(shouldAutoSave(true, null)).toBe(false)
  })

  it("returns true when logged in with thread id", () => {
    expect(shouldAutoSave(true, "thread-123")).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/thread-persistence.test.ts`
Expected: FAIL - module not found

- [ ] **Step 4: Create the persistence hook**

```typescript
// src/hooks/useThreadPersistence.ts
"use client"

import { useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import type { Message, Provider, ResponseLength, Locale, VerdictResult } from "@/types"

// ---- Pure helpers (exported for testing) ----

type DBMessageInput = {
  sender: string
  displayName: string
  content: string
  orderIndex: number
}

export function buildSaveMessages(messages: Message[], offset: number): DBMessageInput[] {
  return messages.map((m, i) => ({
    sender: m.sender,
    displayName: m.displayName,
    content: m.content,
    orderIndex: offset + i,
  }))
}

export function shouldAutoSave(isLoggedIn: boolean, threadId: string | null): boolean {
  return isLoggedIn && threadId !== null
}

// ---- Hook ----

export function useThreadPersistence() {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  const threadIdRef = useRef<string | null>(null)
  const versionRef = useRef<number>(0)
  const lastSavedIndexRef = useRef<number>(-1)

  const createThread = useCallback(
    async (config: {
      title: string
      models: Provider[]
      rounds: number
      responseLength: ResponseLength
      locale: Locale
    }): Promise<string | null> => {
      if (!isLoggedIn) return null
      try {
        const res = await fetch("/api/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
        })
        if (!res.ok) return null
        const thread = await res.json()
        threadIdRef.current = thread.id
        versionRef.current = thread.version ?? 0
        lastSavedIndexRef.current = -1
        return thread.id
      } catch {
        return null
      }
    },
    [isLoggedIn]
  )

  const saveMessages = useCallback(
    async (allMessages: Message[]) => {
      const threadId = threadIdRef.current
      if (!isLoggedIn || !threadId) return

      const unsavedStart = lastSavedIndexRef.current + 1
      const unsaved = allMessages.slice(unsavedStart)
      if (unsaved.length === 0) return

      try {
        const res = await fetch(`/api/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: buildSaveMessages(unsaved, unsavedStart),
            expectedVersion: versionRef.current,
          }),
        })
        if (res.ok) {
          lastSavedIndexRef.current = allMessages.length - 1
          versionRef.current++
        } else if (res.status === 409) {
          console.warn("[persistence] Conflict - thread updated in another tab")
        }
      } catch {
        // Fire-and-forget - debate continues even if save fails
      }
    },
    [isLoggedIn]
  )

  const saveVerdict = useCallback(
    async (verdict: VerdictResult, afterMessageIndex: number) => {
      const threadId = threadIdRef.current
      if (!isLoggedIn || !threadId) return

      try {
        const res = await fetch(`/api/threads/${threadId}/verdicts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recommendation: verdict.recommendedAnswer,
            voteSplit: verdict.voteSplit,
            confidence: verdict.confidence,
            reasons: verdict.reasons,
            minorityView: verdict.minorityView,
            oppositeCase: verdict.oppositeCase,
            afterMessageIndex,
          }),
        })
        if (res.ok) {
          versionRef.current++
        }
      } catch {
        // Fire-and-forget
      }
    },
    [isLoggedIn]
  )

  const continueThread = useCallback(async () => {
    const threadId = threadIdRef.current
    if (!isLoggedIn || !threadId) return

    try {
      await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "active",
          expectedVersion: versionRef.current,
        }),
      })
      versionRef.current++
    } catch {
      // Fire-and-forget
    }
  }, [isLoggedIn])

  const loadThread = useCallback(
    async (threadId: string) => {
      if (!isLoggedIn) return null
      try {
        const res = await fetch(`/api/threads/${threadId}`)
        if (!res.ok) return null
        const thread = await res.json()
        threadIdRef.current = thread.id
        versionRef.current = thread.version
        lastSavedIndexRef.current = thread.messages.length - 1
        return thread
      } catch {
        return null
      }
    },
    [isLoggedIn]
  )

  const reset = useCallback(() => {
    threadIdRef.current = null
    versionRef.current = 0
    lastSavedIndexRef.current = -1
  }, [])

  return {
    threadId: threadIdRef,
    isLoggedIn,
    createThread,
    saveMessages,
    saveVerdict,
    continueThread,
    loadThread,
    reset,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/thread-persistence.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useThreadPersistence.ts src/__tests__/thread-persistence.test.ts src/types.ts
git commit -m "feat: add thread persistence hook with auto-save and optimistic locking"
```

---

### Task 8: Integrate Auto-Save into Debate Engine

**Files:**
- Modify: `src/hooks/useDebateEngine.ts`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Add threadId to debate engine state and hydration action**

In `src/hooks/useDebateEngine.ts`:

Add to the `State` type:
```typescript
threadId: string | null
```

Add to `makeInitialState`:
```typescript
threadId: null,
```

Add a new action type:
```typescript
| { type: "SET_THREAD_ID"; id: string | null }
| { type: "HYDRATE_THREAD"; messages: Message[]; verdict: VerdictResult | null; showSummary: boolean }
```

Add reducer cases:
```typescript
case "SET_THREAD_ID":
  return { ...state, threadId: action.id }
case "HYDRATE_THREAD":
  return {
    ...state,
    messages: action.messages,
    verdict: action.verdict,
    showSummary: action.showSummary,
    isDebating: false,
    currentRound: 0,
    typingModel: null,
  }
```

Also update `RESET` case to clear `threadId`:
```typescript
case "RESET":
  return { ...makeInitialState(state.activeModels), threadId: null }
```

- [ ] **Step 2: Wire persistence callbacks into chat page**

In `src/app/chat/page.tsx`:

1. Import `useThreadPersistence` and `useSession`
2. Initialize the persistence hook
3. After debate starts (user sends first message), create thread:

```typescript
const persistence = useThreadPersistence()

// In the area where handleSendRef fires, add auto-save wiring.
// We need to create a wrapper that intercepts debate lifecycle events.
```

Create a `useEffect` that watches `state.messages` to trigger saves:

```typescript
// Auto-save messages when new ones are added
const prevMessageCount = useRef(0)
useEffect(() => {
  if (!persistence.isLoggedIn) return
  if (state.messages.length <= prevMessageCount.current) {
    prevMessageCount.current = state.messages.length
    return
  }
  prevMessageCount.current = state.messages.length

  // If no thread exists yet and we have a user message, create one
  if (!persistence.threadId.current && state.messages.length > 0) {
    const firstUserMsg = state.messages.find(m => m.sender === "user")
    if (firstUserMsg) {
      persistence.createThread({
        title: firstUserMsg.content.slice(0, 80),
        models: state.activeModels,
        rounds: maxRounds,
        responseLength,
        locale,
      }).then((id) => {
        if (id) {
          dispatch({ type: "SET_THREAD_ID", id })
          // Save all messages so far
          persistence.saveMessages(state.messages)
        }
      })
      return
    }
  }

  // Otherwise save incrementally
  persistence.saveMessages(state.messages)
}, [state.messages.length])

// Auto-save verdict
useEffect(() => {
  if (state.showSummary && state.verdict) {
    const afterIndex = state.messages.length - 1
    persistence.saveVerdict(state.verdict, afterIndex)
  }
}, [state.showSummary])

// Reset persistence on debate reset
const originalHandleReset = handleReset
const wrappedHandleReset = useCallback(() => {
  persistence.reset()
  originalHandleReset()
}, [originalHandleReset, persistence])
```

- [ ] **Step 3: Handle continue-thread persistence**

Add another effect:

```typescript
// When user continues a thread, mark it active again
const prevShowSummary = useRef(state.showSummary)
useEffect(() => {
  if (prevShowSummary.current && !state.showSummary) {
    // Summary was just dismissed - user is continuing
    persistence.continueThread()
  }
  prevShowSummary.current = state.showSummary
}, [state.showSummary])
```

- [ ] **Step 4: Increment debate counter after verdict (for login gate)**

In `src/app/chat/page.tsx`, add:

```typescript
import { incrementDebateCount } from "@/components/LoginGate"

// After verdict is shown, increment the free-debate counter
useEffect(() => {
  if (state.showSummary && !persistence.isLoggedIn) {
    incrementDebateCount()
  }
}, [state.showSummary, persistence.isLoggedIn])
```

- [ ] **Step 5: Test auto-save flow**

Run: `npm run dev`
1. Sign in with Google
2. Start a debate
3. After first round, check Prisma Studio (`npx prisma studio`) - thread should exist with messages
4. After verdict, check Prisma Studio - verdict record should exist
5. Refresh the page - debate is lost (rehydration is next task), but data is in DB

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDebateEngine.ts src/app/chat/page.tsx
git commit -m "feat: integrate auto-save into debate engine lifecycle"
```

---

### Task 9: Thread Rehydration

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `src/hooks/useDebateEngine.ts`

- [ ] **Step 1: Add URL-based thread loading**

Use a query parameter to load a specific thread. In `src/app/chat/page.tsx`:

```typescript
import { useSearchParams } from "next/navigation"

// Inside ChatPage:
const searchParams = useSearchParams()
const threadParam = searchParams.get("thread")
```

Add an effect to load a thread from the URL:

```typescript
const threadLoaded = useRef(false)
useEffect(() => {
  if (!threadParam || threadLoaded.current || !persistence.isLoggedIn) return
  threadLoaded.current = true

  persistence.loadThread(threadParam).then((thread) => {
    if (!thread) return

    // Rebuild client messages from DB records
    const messages: Message[] = thread.messages.map((m: any) => ({
      id: `db-${m.id}`,
      sender: m.sender as Message["sender"],
      displayName: m.displayName,
      content: m.content,
      timestamp: new Date(m.createdAt),
      ...(m.sender === "verdict" ? {
        verdictData: thread.verdicts.find((v: any) => v.afterMessageIndex <= m.orderIndex)
      } : {}),
    }))

    // Find the last verdict
    const lastVerdict = thread.verdicts[thread.verdicts.length - 1]
    const verdictResult: VerdictResult | null = lastVerdict
      ? {
          recommendedAnswer: lastVerdict.recommendation,
          voteSplit: lastVerdict.voteSplit,
          confidence: lastVerdict.confidence,
          reasons: lastVerdict.reasons,
          minorityView: lastVerdict.minorityView,
          oppositeCase: lastVerdict.oppositeCase,
        }
      : null

    // Set config from thread
    if (thread.models?.length) dispatch({ type: "SET_MODELS", models: thread.models })
    if (thread.responseLength) setResponseLength(thread.responseLength)
    if (thread.rounds) setMaxRounds(thread.rounds)
    if (thread.locale) setLocale(thread.locale)

    // Hydrate debate engine
    dispatch({
      type: "HYDRATE_THREAD",
      messages,
      verdict: verdictResult,
      showSummary: thread.status === "complete",
    })
    dispatch({ type: "SET_THREAD_ID", id: thread.id })
  })
}, [threadParam, persistence.isLoggedIn])
```

- [ ] **Step 2: Update messagesRef sync in useDebateEngine**

In `useDebateEngine.ts`, make sure the `HYDRATE_THREAD` action also updates `messagesRef`. The existing `useEffect` already syncs `messagesRef` from `state.messages`, so this should work automatically.

- [ ] **Step 3: Test rehydration**

Run: `npm run dev`
1. Sign in, complete a debate (so it saves to DB)
2. Copy the thread ID from Prisma Studio
3. Navigate to `/chat?thread=<thread-id>`
4. Verify all messages and verdict are restored
5. Verify "continue thread" works from the rehydrated state

- [ ] **Step 4: Commit**

```bash
git add src/app/chat/page.tsx src/hooks/useDebateEngine.ts
git commit -m "feat: add thread rehydration from URL parameter"
```

---

## Chunk 3: History UI (Title Dropdown + Search + Delete)

### Task 10: Thread Dropdown Component

**Files:**
- Create: `src/components/ThreadDropdown.tsx`

- [ ] **Step 1: Create the thread dropdown component**

```typescript
// src/components/ThreadDropdown.tsx
"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Trash2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import type { ThreadSummary, Locale } from "@/types"

const t = {
  en: {
    search: "Search threads...",
    newDebate: "New Debate",
    noThreads: "No past debates",
    deleteConfirm: "Delete this thread?",
    active: "Active",
  },
  ko: {
    search: "토론 검색...",
    newDebate: "새 토론",
    noThreads: "이전 토론이 없습니다",
    deleteConfirm: "이 토론을 삭제하시겠습니까?",
    active: "진행 중",
  },
}

function timeAgo(date: string, locale: Locale): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return locale === "ko" ? "방금" : "just now"
  if (minutes < 60) return locale === "ko" ? `${minutes}분 전` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`
  return new Date(date).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  })
}

export default function ThreadDropdown({
  currentThreadId,
  currentTitle,
  locale,
  onNewDebate,
}: {
  currentThreadId: string | null
  currentTitle: string | null
  locale: Locale
  onNewDebate: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const labels = t[locale]

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen])

  // Fetch threads when dropdown opens
  const fetchThreads = useCallback(async (query?: string) => {
    setLoading(true)
    try {
      const url = new URL("/api/threads", window.location.origin)
      if (query) url.searchParams.set("q", query)
      const res = await fetch(url.toString())
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) fetchThreads()
  }, [isOpen, fetchThreads])

  // Debounced search
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => fetchThreads(search || undefined), 300)
    return () => clearTimeout(timer)
  }, [search, isOpen, fetchThreads])

  const handleSelect = (threadId: string) => {
    setIsOpen(false)
    router.push(`/chat?thread=${threadId}`)
  }

  const handleDelete = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    if (!confirm(labels.deleteConfirm)) return
    try {
      await fetch(`/api/threads/${threadId}`, { method: "DELETE" })
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
    } catch {
      // Silently fail
    }
  }

  const displayTitle = currentTitle || "Quorum"

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)] hover:text-[var(--foreground)]/80 transition-colors max-w-[200px] sm:max-w-[300px]"
      >
        <span className="truncate">{displayTitle}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-[var(--border)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={labels.search}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* New debate button */}
            <button
              onClick={() => { setIsOpen(false); onNewDebate() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--primary)] hover:bg-[var(--accent)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {labels.newDebate}
            </button>

            {/* Thread list */}
            <div className="max-h-64 overflow-y-auto thin-scrollbar">
              {loading ? (
                <div className="p-4 text-center text-sm text-[var(--muted-foreground)]">...</div>
              ) : threads.length === 0 ? (
                <div className="p-4 text-center text-sm text-[var(--muted-foreground)]">
                  {labels.noThreads}
                </div>
              ) : (
                threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => handleSelect(thread.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-[var(--accent)] transition-colors group",
                      thread.id === currentThreadId && "bg-[var(--accent)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--foreground)] truncate">
                          {thread.title}
                        </p>
                        {thread.verdicts[0] && (
                          <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                            {thread.verdicts[0].recommendation}
                            <span className="ml-1 opacity-60">
                              ({thread.verdicts[0].confidence}%)
                            </span>
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {timeAgo(thread.updatedAt, locale)}
                          </span>
                          {thread.status === "active" && (
                            <span className="text-xs text-green-500">{labels.active}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, thread.id)}
                        className="shrink-0 p-1 opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ThreadDropdown.tsx
git commit -m "feat: add thread history dropdown with search and delete"
```

---

### Task 11: Integrate Dropdown into Chat Page

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Add ThreadDropdown to Header**

In `src/components/Header.tsx`, add a new prop for the dropdown and render it in place of (or alongside) the "Quorum" title:

Add new props:
```typescript
threadTitle?: string | null
threadId?: string | null
onNewDebate?: () => void
```

Import and render the dropdown:
```typescript
import ThreadDropdown from "@/components/ThreadDropdown"
import { useSession } from "next-auth/react"

// In the header's left section, replace the static "Quorum" text:
{session?.user ? (
  <ThreadDropdown
    currentThreadId={threadId ?? null}
    currentTitle={threadTitle ?? null}
    locale={locale}
    onNewDebate={onNewDebate ?? (() => {})}
  />
) : (
  <span className="text-sm font-semibold">Quorum</span>
)}
```

- [ ] **Step 2: Pass thread props from chat page**

In `src/app/chat/page.tsx`, compute the current thread title and pass it down:

```typescript
// Derive current title from first user message
const currentTitle = state.messages.find(m => m.sender === "user")?.content.slice(0, 80) ?? null

// New debate handler
const handleNewDebate = useCallback(() => {
  persistence.reset()
  handleReset()
  router.push("/chat")
}, [persistence, handleReset, router])
```

Pass to ChatHeader:
```typescript
<ChatHeader
  // ... existing props
  threadTitle={currentTitle}
  threadId={state.threadId}
  onNewDebate={handleNewDebate}
/>
```

- [ ] **Step 3: Test the full flow**

Run: `npm run dev`
1. Sign in
2. Start a debate - should auto-save
3. Click the thread title in the header - dropdown opens
4. See the current thread in the list
5. Start a new debate via "+ New Debate" button
6. Check dropdown again - should show both threads
7. Click the first thread - should rehydrate with all messages + verdict
8. Search for a thread by title
9. Delete a thread from the dropdown
10. Verify mobile viewport - dropdown stretches full width

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx src/app/chat/page.tsx
git commit -m "feat: integrate thread history dropdown into chat header"
```

---

### Task 12: Wire Homepage Auth + Final Polish

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add real auth to homepage**

In `src/app/page.tsx`:
1. Import `useSession` from `next-auth/react`
2. Replace any mock `isLoggedIn` state with `const { data: session } = useSession()`
3. Update the existing login/logout button handlers to use `signIn("google")` / `signOut()`

- [ ] **Step 2: Test the complete flow end-to-end**

Run: `npm run dev`

Full flow test:
1. Fresh incognito window - homepage loads
2. Select models, type a topic, send - first debate runs (no login gate)
3. Verdict appears - `quorum_debate_count` incremented
4. Go back to homepage, try second debate - login gate modal appears
5. Click "Sign in with Google" - OAuth flow
6. On return, prompt auto-submits (preserved across redirect)
7. Debate runs and auto-saves to DB
8. Click thread title - dropdown shows history
9. Open a new tab, navigate to same thread - both tabs show it
10. Continue thread in Tab A, then try to save in Tab B - Tab B gets 409
11. Delete a thread from dropdown - gone from list
12. Refresh the page, click thread from dropdown - full rehydration

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire real auth into homepage and complete thread persistence"
```

---

### Task 13: Run All Tests + Verify Build

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (existing + new login-gate + thread-persistence tests)

- [ ] **Step 2: Verify production build**

Run: `npm run build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Fix any issues found**

Address any type errors, lint issues, or build failures.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix build and test issues"
```
