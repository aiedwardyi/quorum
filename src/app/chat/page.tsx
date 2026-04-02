"use client"

import { useCallback, useRef, useEffect, useState } from "react"
import { THEMES } from "@/types"
import type { Provider, Locale, ResponseLength, Theme } from "@/types"
import { useDebateEngine } from "@/hooks/useDebateEngine"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import ChatHeader from "@/components/Header"
import SettingsModal from "@/components/SettingsModal"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"

const DEFAULT_MODELS: Provider[] = ["gemini", "perplexity"]

export default function ChatPage() {
  // Config loaded from sessionStorage (set by homepage)
  const [locale, setLocale] = useState<Locale>("en")
  const [responseLength, setResponseLength] = useState<ResponseLength>("medium")
  const [maxRounds, setMaxRounds] = useState(5)
  const [theme, setTheme] = useState<Theme>("dark")
  const [isLoggedIn, setIsLoggedIn] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const { state, dispatch, handleSend, handleStop, handleReset, handleSendRef } =
    useDebateEngine({ locale, responseLength, maxRounds })

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

  // BUG-015: Detect bfcache restore (back/forward nav) and re-apply state
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        // Page was restored from bfcache - re-apply theme and bump key
        const saved = localStorage.getItem("quorum_theme") as Theme | null
        if (saved && (THEMES as readonly string[]).includes(saved)) {
          setTheme(saved)
        }
        setMountKey((k) => k + 1)
      }
    }
    window.addEventListener("pageshow", handlePageShow)
    return () => window.removeEventListener("pageshow", handlePageShow)
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
        isLoggedIn={isLoggedIn}
        onLogin={() => setIsLoggedIn(true)}
        onLogout={() => setIsLoggedIn(false)}
        isDebating={state.isDebating}
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
