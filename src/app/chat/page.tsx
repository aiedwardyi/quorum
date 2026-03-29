"use client"

import { useReducer, useCallback, useRef, useEffect, useState } from "react"
import type { Message, Provider, ConsensusResult, Locale, ResponseLength, Theme } from "@/types"
import { cleanResponse } from "@/lib/clean-response"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import SummaryCard from "@/components/SummaryCard"
import ChatHeader from "@/components/Header"
import SettingsModal from "@/components/SettingsModal"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown } from "lucide-react"

/* ─── Types ─── */

type State = {
  messages: Message[]
  activeModels: Provider[]
  consensus: ConsensusResult | null
  isDebating: boolean
  currentRound: number
  typingModel: Provider | null
  showSummary: boolean
}

type Action =
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "UPDATE_LAST_AI_CONTENT"; content: string }
  | { type: "SET_TYPING"; model: Provider | null }
  | { type: "SET_DEBATING"; value: boolean }
  | { type: "SET_CONSENSUS"; result: ConsensusResult }
  | { type: "SET_ROUND"; round: number }
  | { type: "SHOW_SUMMARY" }
  | { type: "TOGGLE_MODEL"; model: Provider }
  | { type: "SET_MODELS"; models: Provider[] }
  | { type: "RESET" }

function makeInitialState(models: Provider[]): State {
  return {
    messages: [],
    activeModels: models,
    consensus: null,
    isDebating: false,
    currentRound: 0,
    typingModel: null,
    showSummary: false,
  }
}

const DEFAULT_MODELS: Provider[] = ["gemini", "perplexity"]

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }
    case "UPDATE_LAST_AI_CONTENT": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.sender !== "user") msgs[msgs.length - 1] = { ...last, content: action.content }
      return { ...state, messages: msgs }
    }
    case "SET_TYPING":
      return { ...state, typingModel: action.model }
    case "SET_DEBATING":
      return { ...state, isDebating: action.value }
    case "SET_CONSENSUS":
      return { ...state, consensus: action.result }
    case "SET_ROUND":
      return { ...state, currentRound: action.round }
    case "SHOW_SUMMARY":
      return { ...state, showSummary: true, isDebating: false, typingModel: null }
    case "TOGGLE_MODEL": {
      const has = state.activeModels.includes(action.model)
      if (has && state.activeModels.length <= 1) return state
      return { ...state, activeModels: has ? state.activeModels.filter((m) => m !== action.model) : [...state.activeModels, action.model] }
    }
    case "SET_MODELS":
      return { ...state, activeModels: action.models }
    case "RESET":
      return makeInitialState(state.activeModels)
    default:
      return state
  }
}

const DISPLAY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
  gpt: "GPT",
}

/* ─── Page ─── */

export default function ChatPage() {
  // Config loaded from sessionStorage (set by homepage)
  const [locale, setLocale] = useState<Locale>("en")
  const [responseLength, setResponseLength] = useState<ResponseLength>("medium")
  const [maxRounds, setMaxRounds] = useState(5)
  const [theme, setTheme] = useState<Theme>("dark")
  const [isLoggedIn, setIsLoggedIn] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [state, dispatch] = useReducer(reducer, makeInitialState(DEFAULT_MODELS))
  const stopRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const handleSendRef = useRef<(text: string, target: Provider | "all", models: Provider[]) => void>(() => {})

  // Apply theme classes to <html>
  useEffect(() => {
    const cl = document.documentElement.classList
    cl.remove("dark", "tokyonight", "lovelace")
    if (theme === "dark") cl.add("dark")
    else if (theme === "tokyonight") { cl.add("dark", "tokyonight") }
    else if (theme === "lovelace") { cl.add("dark", "lovelace") }
  }, [theme])

  // Auto-scroll to top of summary card when it appears
  useEffect(() => {
    if (state.showSummary && summaryRef.current) {
      setTimeout(() => {
        summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 300)
    }
  }, [state.showSummary])

  /* ─── Read config from sessionStorage on mount ─── */
  const initialPromptSent = useRef(false)
  const pendingPrompt = useRef<{ prompt: string; models: Provider[] } | null>(null)

  useEffect(() => {
    // Read theme from localStorage (set by homepage)
    const savedTheme = localStorage.getItem("quorum_theme") as Theme | null
    if (savedTheme && ["light", "dark", "tokyonight", "lovelace"].includes(savedTheme)) {
      setTheme(savedTheme)
    }

    const raw = sessionStorage.getItem("quorum_config")
    if (!raw) return

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
      // malformed config — ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fire pending prompt after state has settled
  useEffect(() => {
    if (pendingPrompt.current && !initialPromptSent.current) {
      initialPromptSent.current = true
      const { prompt: p, models } = pendingPrompt.current
      pendingPrompt.current = null
      setTimeout(() => handleSendRef.current(p, "all", models), 0)
    }
  })

  /* ─── Streaming logic (v1 preserved) ─── */

  const callModel = useCallback(
    async (provider: Provider, allMessages: Message[]): Promise<Message | null> => {
      dispatch({ type: "SET_TYPING", model: provider })

      const placeholderId = `${provider}-${Date.now()}`
      const placeholder: Message = {
        id: placeholderId,
        sender: provider,
        displayName: DISPLAY_NAMES[provider],
        content: "",
        timestamp: new Date(),
      }
      dispatch({ type: "ADD_MESSAGE", message: placeholder })

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages, provider, locale, responseLength }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let fullContent = ""

        while (true) {
          if (stopRef.current) { await reader.cancel(); break }
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const data = JSON.parse(trimmed.slice(5).trim())
            if (data.error) throw new Error(data.error)
            if (data.chunk) {
              fullContent += data.chunk
              dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: fullContent })
            }
          }
        }

        const cleaned = cleanResponse(fullContent)
        dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: cleaned })
        dispatch({ type: "SET_TYPING", model: null })
        return { ...placeholder, content: cleaned }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          dispatch({ type: "SET_TYPING", model: null })
          dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: "Response cancelled." })
          return null
        }
        console.error(`${provider} failed:`, err)
        dispatch({ type: "SET_TYPING", model: null })
        dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: `⚠️ ${provider} encountered an error.` })
        return null
      }
    },
    [locale, responseLength]
  )

  const runRound = useCallback(
    async (currentMessages: Message[], activeModels: Provider[]): Promise<{ msgs: Message[]; done: boolean }> => {
      let msgs = [...currentMessages]

      for (const model of activeModels) {
        if (stopRef.current) break
        const result = await callModel(model, msgs)
        if (result) msgs = [...msgs, result]
      }

      if (stopRef.current) return { msgs, done: true }

      const aiCount = msgs.filter((m) => m.sender !== "user").length
      if (aiCount >= 2 && activeModels.length >= 2) {
        try {
          const res = await fetch("/api/consensus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: msgs, locale }),
          })
          if (res.ok) {
            const result: ConsensusResult = await res.json()
            dispatch({ type: "SET_CONSENSUS", result })
          }
        } catch (err) {
          console.error("Consensus check failed:", err)
        }
      }

      return { msgs, done: false }
    },
    [callModel, locale]
  )

  // Internal send that accepts explicit models (used for auto-send on mount)
  const handleSendWithModels = useCallback(
    async (text: string, target: Provider | "all", models: Provider[]) => {
      const userMsg: Message = {
        id: `user-${Date.now()}`,
        sender: "user",
        displayName: "You",
        content: text,
        timestamp: new Date(),
      }
      dispatch({ type: "ADD_MESSAGE", message: userMsg })
      dispatch({ type: "SET_DEBATING", value: true })
      stopRef.current = false

      const allMessages = [...state.messages, userMsg]

      if (target === "all") {
        let msgs = allMessages
        const rounds = models.length >= 2 ? maxRounds : 1
        let stoppedEarly = false
        for (let r = 0; r < rounds; r++) {
          if (stopRef.current) break
          dispatch({ type: "SET_ROUND", round: r + 1 })
          const result = await runRound(msgs, models)
          msgs = result.msgs
          if (result.done) { stoppedEarly = true; break }
        }

        // If all rounds finished without being stopped early, fetch final consensus and show summary
        if (!stoppedEarly && !stopRef.current && models.length >= 2) {
          const aiCount = msgs.filter((m) => m.sender !== "user").length
          if (aiCount >= 2) {
            try {
              const res = await fetch("/api/consensus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: msgs, locale }),
              })
              if (res.ok) {
                const result: ConsensusResult = await res.json()
                dispatch({ type: "SET_CONSENSUS", result })
                dispatch({ type: "SHOW_SUMMARY" })
              }
            } catch (err) {
              console.error("Final consensus failed:", err)
            }
          }
        }
      } else {
        await callModel(target, allMessages)
      }

      dispatch({ type: "SET_DEBATING", value: false })
    },
    [state.messages, maxRounds, callModel, runRound, locale]
  )

  handleSendRef.current = handleSendWithModels

  const handleSend = useCallback(
    async (text: string, target: Provider | "all") => {
      handleSendWithModels(text, target, state.activeModels)
    },
    [handleSendWithModels, state.activeModels]
  )

  const handleStop = useCallback(async () => {
    stopRef.current = true
    abortRef.current?.abort()
    dispatch({ type: "SET_DEBATING", value: false })
    dispatch({ type: "SET_TYPING", model: null })

    const aiCount = state.messages.filter((m) => m.sender !== "user").length
    if (aiCount >= 2) {
      try {
        const res = await fetch("/api/consensus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: state.messages, locale }),
        })
        if (res.ok) {
          const result: ConsensusResult = await res.json()
          dispatch({ type: "SET_CONSENSUS", result })
          dispatch({ type: "SHOW_SUMMARY" })
        }
      } catch (err) {
        console.error("Final consensus failed:", err)
      }
    }
  }, [state.messages, locale])

  const handleReset = useCallback(() => {
    stopRef.current = true
    abortRef.current?.abort()
    dispatch({ type: "RESET" })
  }, [])

  const changeTheme = (t: Theme) => {
    setTheme(t)
    localStorage.setItem("quorum_theme", t)
  }

  const toggleTheme = () => {
    const order: Theme[] = ["light", "dark", "tokyonight", "lovelace"]
    const next = order[(order.indexOf(theme) + 1) % order.length]
    changeTheme(next)
  }

  /* ─── Render ─── */

  return (
    <div className="relative flex flex-col h-screen bg-background overflow-hidden font-[family-name:var(--font-geist-sans)] text-foreground transition-colors duration-200">
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

        {state.showSummary && state.consensus && (
          <div ref={summaryRef} className="px-4 pb-8">
            <SummaryCard result={state.consensus} onNewDiscussion={handleReset} locale={locale} />
          </div>
        )}

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
          {(state.isDebating || state.typingModel !== null || state.consensus !== null) && (
            <ConsensusMeter
              score={state.consensus?.score ?? null}
              result={state.showSummary ? state.consensus : null}
              locale={locale}

            />
          )}
        </AnimatePresence>

        {!state.showSummary && (
          <MessageInput
            onSend={handleSend}
            onStop={handleStop}
            disabled={state.isDebating}
            locale={locale}
          />
        )}
      </div>
    </div>
  )
}
