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
  return isLoggedIn && !!threadId
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
            expectedVersion: versionRef.current,
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
      const res = await fetch(`/api/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "active",
          expectedVersion: versionRef.current,
        }),
      })
      if (res.ok) versionRef.current++
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
