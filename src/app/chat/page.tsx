"use client"

import { Suspense, useCallback, useRef, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { THEMES } from "@/types"
import type { Provider, Locale, ResponseLength, Theme, Message, VerdictResult } from "@/types"
import { useDebateEngine } from "@/hooks/useDebateEngine"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import ChatHeader from "@/components/Header"
import SettingsModal from "@/components/SettingsModal"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { useThreadPersistence } from "@/hooks/useThreadPersistence"
import { incrementDebateCount } from "@/components/LoginGate"

const DEFAULT_MODELS: Provider[] = ["gemini", "perplexity"]

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageContent />
    </Suspense>
  )
}

function ChatPageContent() {
  // Config loaded from sessionStorage (set by homepage)
  const [locale, setLocale] = useState<Locale>("en")
  const [responseLength, setResponseLength] = useState<ResponseLength>("medium")
  const [maxRounds, setMaxRounds] = useState(5)
  const [theme, setTheme] = useState<Theme>("dark")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const { state, dispatch, handleSend, handleStop, handleReset, handleSendRef } =
    useDebateEngine({ locale, responseLength, maxRounds })

  const persistence = useThreadPersistence()
  const router = useRouter()

  const searchParams = useSearchParams()
  const threadParam = searchParams.get("thread")

  const mainRef = useRef<HTMLElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  // Bumped on bfcache restore to force framer-motion remount
  const [mountKey, setMountKey] = useState(0)

  // Apply theme classes to <html>
  useEffect(() => {
    const cl = document.documentElement.classList
    cl.remove(...THEMES.filter((t) => t !== "light"))
    if (theme !== "light") {
      cl.add("dark")
      if (theme !== "dark") cl.add(theme)
    }
  }, [theme])

  // BUG-015: Re-apply theme when page becomes visible again
  // (handles bfcache restore, Next.js client-side back/forward, and tab switching)
  useEffect(() => {
    const reapplyTheme = () => {
      const saved = localStorage.getItem("quorum_theme") as Theme | null
      if (saved && (THEMES as readonly string[]).includes(saved)) {
        setTheme(saved)
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible") reapplyTheme()
    }
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        reapplyTheme()
        setMountKey((k) => k + 1)
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("pageshow", handlePageShow)
    window.addEventListener("focus", reapplyTheme)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("focus", reapplyTheme)
    }
  }, [])

  /* ---- Read config from sessionStorage on mount ---- */
  const initialPromptSent = useRef(false)
  const pendingPrompt = useRef<{ prompt: string; models: Provider[] } | null>(null)
  const [configHydrated, setConfigHydrated] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem("quorum_theme") as Theme | null
    if (savedTheme && (THEMES as readonly string[]).includes(savedTheme)) {
      setTheme(savedTheme)
    }

    const raw = sessionStorage.getItem("quorum_config")
    if (!raw) {
      setConfigHydrated(true)
      return
    }

    try {
      const config = JSON.parse(raw) as {
        prompt?: string
        models?: Provider[]
        responseLength?: ResponseLength
        rounds?: number
        locale?: Locale
      }

      sessionStorage.removeItem("quorum_config")

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
    } catch {
      // malformed config - ignore
    } finally {
      setConfigHydrated(true)
    }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fire pending prompt after state has settled
  useEffect(() => {
    if (!configHydrated) return
    if (pendingPrompt.current && !initialPromptSent.current) {
      initialPromptSent.current = true
      const { prompt: p, models } = pendingPrompt.current
      pendingPrompt.current = null
      setTimeout(() => handleSendRef.current(p, "all", models), 0)
    }
  }, [configHydrated, handleSendRef])

  const changeTheme = useCallback((t: Theme) => {
    setTheme(t)
    localStorage.setItem("quorum_theme", t)
  }, [])

  const toggleTheme = useCallback(() => {
    const order = THEMES
    setTheme((prev) => {
      const next = order[(order.indexOf(prev) + 1) % order.length]
      localStorage.setItem("quorum_theme", next)
      return next
    })
  }, [])

  // Auto-save messages when new ones are added
  const creatingThreadRef = useRef(false)
  const prevMessageCount = useRef(0)
  useEffect(() => {
    if (!persistence.isLoggedIn) return
    if (state.messages.length <= prevMessageCount.current) {
      prevMessageCount.current = state.messages.length
      return
    }
    prevMessageCount.current = state.messages.length

    // If no thread exists yet and we have a user message, create one
    if (!persistence.threadId.current && !creatingThreadRef.current && state.messages.length > 0) {
      const firstUserMsg = state.messages.find(m => m.sender === "user")
      if (firstUserMsg) {
        creatingThreadRef.current = true
        persistence.createThread({
          title: firstUserMsg.content.slice(0, 80),
          models: state.activeModels,
          rounds: maxRounds,
          responseLength,
          locale,
        }).then((id) => {
          creatingThreadRef.current = false
          if (id) {
            dispatch({ type: "SET_THREAD_ID", id })
            persistence.saveMessages(state.messages)
          }
        })
        return
      }
    }

    // Otherwise save incrementally
    persistence.saveMessages(state.messages)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages.length])

  // Auto-save verdict when summary is shown
  useEffect(() => {
    if (state.showSummary && state.verdict && persistence.threadId.current) {
      const afterIndex = state.messages.length - 1
      persistence.saveVerdict(state.verdict, afterIndex)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showSummary])

  const currentTitle = state.messages.find(m => m.sender === "user")?.content.slice(0, 80) ?? null

  const handleNewDebate = useCallback(() => {
    creatingThreadRef.current = false
    persistence.reset()
    handleReset()
    router.push("/chat")
  }, [persistence, handleReset, router])

  // When user continues a completed thread, mark it active again
  const prevShowSummary = useRef(state.showSummary)
  useEffect(() => {
    if (prevShowSummary.current && !state.showSummary) {
      persistence.continueThread()
    }
    prevShowSummary.current = state.showSummary
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showSummary])

  // Load thread from URL parameter
  const threadLoaded = useRef<string | null>(null)
  useEffect(() => {
    if (!threadParam || threadLoaded.current === threadParam || !persistence.isLoggedIn) return
    threadLoaded.current = threadParam

    persistence.loadThread(threadParam).then((thread) => {
      if (!thread) return

      // Rebuild client messages from DB records
      const messages: Message[] = thread.messages.map((m: any) => ({
        id: `db-${m.id}`,
        sender: m.sender as Message["sender"],
        displayName: m.displayName,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }))

      // Inject verdict data into verdict messages
      for (const verdict of thread.verdicts) {
        const verdictMsg = messages.find(
          (m, i) => m.sender === "verdict" && i >= verdict.afterMessageIndex
        )
        if (verdictMsg) {
          verdictMsg.verdictData = {
            recommendedAnswer: verdict.recommendation,
            voteSplit: verdict.voteSplit,
            confidence: verdict.confidence,
            reasons: verdict.reasons,
            minorityView: verdict.minorityView,
            oppositeCase: verdict.oppositeCase,
          }
        }
      }

      // Find the last verdict for the state
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam, persistence.isLoggedIn])

  // Increment free-debate counter after verdict (for login gate)
  const hasIncrementedRef = useRef(false)
  useEffect(() => {
    if (state.showSummary && !persistence.isLoggedIn && !hasIncrementedRef.current) {
      hasIncrementedRef.current = true
      incrementDebateCount()
    }
    if (!state.showSummary) {
      hasIncrementedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showSummary, persistence.isLoggedIn])

  /* ---- Render ---- */

  return (
    <div key={mountKey} className="relative flex flex-col h-screen bg-background overflow-hidden font-[family-name:var(--font-geist-sans)] text-foreground transition-colors duration-200">
      <ChatHeader
        currentRound={state.currentRound}
        maxRounds={maxRounds}
        responseLength={responseLength}
        onChangeResponseLength={setResponseLength}
        locale={locale}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDebating={state.isDebating}
        threadTitle={currentTitle}
        threadId={state.threadId}
        onNewDebate={handleNewDebate}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        locale={locale}
        onToggleLocale={() => setLocale((l) => (l === "en" ? "ko" : "en"))}
        activeModels={state.activeModels}
        onToggleModel={(m) => dispatch({ type: "TOGGLE_MODEL", model: m })}
        maxRounds={maxRounds}
        onChangeRounds={setMaxRounds}
        isDebating={state.isDebating}
        theme={theme}
        onChangeTheme={changeTheme}
      />

      {/* Scrollable message area */}
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto relative thin-scrollbar scroll-smooth"
        onScroll={() => {
          const el = mainRef.current
          if (!el) return
          const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
          setShowScrollDown(distFromBottom > 200)
        }}
      >
        <ChatThread
          messages={state.messages}
          typingModel={state.typingModel}
          locale={locale}
          activeModels={state.activeModels}
          onSendMessage={(text) => handleSend(text, "all")}
          onNewDiscussion={handleNewDebate}
        />
      </main>

      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            onClick={() => mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: "smooth" })}
            className="absolute left-1/2 -translate-x-1/2 bottom-20 sm:bottom-24 w-8 h-8 rounded-full bg-zinc-500/20 dark:bg-zinc-400/15 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 flex items-center justify-center hover:bg-zinc-500/30 dark:hover:bg-zinc-400/25 transition-colors z-30"
          >
            <ChevronDown className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom bar: consensus rail + input */}
      <div className="w-full shrink-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-4 z-10">
        <AnimatePresence>
          {(state.isDebating || state.typingModel !== null || state.verdict !== null) && (
            <ConsensusMeter
              score={state.verdict?.confidence ?? null}
              result={state.showSummary ? state.verdict : null}
              locale={locale}
            />
          )}
        </AnimatePresence>

        <MessageInput
          onSend={handleSend}
          onStop={handleStop}
          disabled={state.isDebating}
          locale={locale}
        />
      </div>
    </div>
  )
}
