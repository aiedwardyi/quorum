"use client"

import { Suspense, useCallback, useRef, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { useSession, signIn, signOut } from "next-auth/react"
import { Sun, Moon, Star, Heart, Flame, Cat, Snowflake, Sunrise, ChevronDown, User, Settings2, Sparkles, LogIn, LogOut } from "lucide-react"
import dynamic from "next/dynamic"

import { THEMES } from "@/types"
import type { Provider, Locale, ResponseLength, Theme, Message, VerdictResult } from "@/types"
import { cn } from "@/lib/utils"
import { useDebateEngine, SYSTEM_MESSAGES } from "@/hooks/useDebateEngine"
import { useThreadPersistence } from "@/hooks/useThreadPersistence"
import { shouldShowLoginGate, savePendingDebate, incrementDebateCount } from "@/components/LoginGate"
import LoginGateModal from "@/components/LoginGate"
import ThreadDropdown from "@/components/ThreadDropdown"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import ChatHeader, { leaveDebateStrings } from "@/components/Header"
import ConfirmDialog from "@/components/ConfirmDialog"
import SetupView, { type SetupSubmitInfo } from "@/components/SetupView"

const SettingsModal = dynamic(() => import("@/components/SettingsModal"), { ssr: false })

const DEFAULT_MODELS: Provider[] = ["perplexity", "claude", "gpt", "gemini"]

/* ─── Phase transition variants ─── */

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1]

const setupVariants = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 0, y: -40, transition: { duration: 0.35, ease: EASE_OUT } },
}

const activeVariants = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT, delay: 0.1 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
}

/* ─── Main ─── */

export default function Page() {
  return (
    <Suspense>
      <PageContent />
    </Suspense>
  )
}

function PageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const threadParam = searchParams.get("thread")
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user

  /* ── Phase ── */
  const [phase, setPhase] = useState<"setup" | "active">(threadParam ? "active" : "setup")

  /* ── Shared settings ── */
  const [locale, setLocale] = useState<Locale>("ko")
  const [theme, setTheme] = useState<Theme>("dark")
  const [responseLength, setResponseLength] = useState<ResponseLength>("short")
  const [maxRounds, setMaxRounds] = useState(1)

  /* ── Setup-phase state ── */
  const [selectedModels, setSelectedModels] = useState<Provider[]>(DEFAULT_MODELS)
  const [showGate, setShowGate] = useState(false)
  const [prefillPrompt, setPrefillPrompt] = useState<string | null>(null)

  /* ── Settings modal & header UI ── */
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  /* ── Chat-phase state ── */
  const { state, dispatch, handleSend, handleStop, handleReset, handleSendRef } =
    useDebateEngine({ locale, responseLength, maxRounds })
  const persistence = useThreadPersistence()
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [fileWarning, setFileWarning] = useState<string | null>(null)
  const [prefillText] = useState<string | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const [mountKey, setMountKey] = useState(0)

  /* ── Back navigation guard ── */
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const isDebatingRef = useRef(state.isDebating)
  const allowBackRef = useRef(false)
  const guardPushedRef = useRef(false)
  const leavingRef = useRef(false)
  isDebatingRef.current = state.isDebating

  useEffect(() => {
    if (!state.isDebating) {
      if (guardPushedRef.current && history.state?.debateGuard) {
        guardPushedRef.current = false
        allowBackRef.current = true
        history.back()
      } else {
        guardPushedRef.current = false
      }
      return
    }
    history.pushState({ debateGuard: true }, "")
    guardPushedRef.current = true

    const handlePopState = () => {
      if (leavingRef.current) return
      if (allowBackRef.current) { allowBackRef.current = false; return }
      if (isDebatingRef.current) {
        history.pushState({ debateGuard: true }, "")
        setShowBackConfirm(true)
      }
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("popstate", handlePopState)
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("popstate", handlePopState)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [state.isDebating])

  /* ── Theme ── */
  const applyThemeToDOM = useCallback((t: Theme) => {
    const cl = document.documentElement.classList
    cl.remove(...THEMES.filter((th) => th !== "light"))
    const isLightTheme = t === "light" || t === "solarized"
    if (!isLightTheme) {
      cl.add("dark")
      if (t !== "dark") cl.add(t)
    } else if (t === "solarized") {
      cl.add("solarized")
    }
  }, [])

  useEffect(() => { applyThemeToDOM(theme) }, [theme, applyThemeToDOM])

  useEffect(() => {
    const applyTheme = () => {
      let saved = localStorage.getItem("quorum_theme") as string | null
      if (saved === "github") { saved = "solarized"; localStorage.setItem("quorum_theme", "solarized") }
      const valid = THEMES
      if (saved && valid.includes(saved as Theme)) {
        setTheme(saved as Theme)
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setTheme("dark")
      } else {
        setTheme("light")
      }
    }
    applyTheme()

    const handleVisibility = () => { if (document.visibilityState === "visible") applyTheme() }
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { applyTheme(); setMountKey((k) => k + 1) }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("pageshow", handlePageShow)
    window.addEventListener("focus", applyTheme)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("focus", applyTheme)
    }
  }, [])

  const changeTheme = useCallback((t: Theme) => {
    setTheme(t)
    localStorage.setItem("quorum_theme", t)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = THEMES[(THEMES.indexOf(prev) + 1) % THEMES.length]
      localStorage.setItem("quorum_theme", next)
      return next
    })
  }, [])

  /* ── Locale ── */
  useEffect(() => {
    const saved = localStorage.getItem("quorum_locale")
    if (saved === "en" || saved === "ko") setLocale(saved)
  }, [])

  const toggleLocale = useCallback(() => {
    setLocale((l) => {
      const next = l === "en" ? "ko" : "en"
      localStorage.setItem("quorum_locale", next)
      return next
    })
  }, [])

  /* ── Hydrate persisted settings ── */
  useEffect(() => {
    const savedLength = localStorage.getItem("quorum_responseLength") as string | null
    if (savedLength === "short" || savedLength === "medium" || savedLength === "long") setResponseLength(savedLength)
    const savedRounds = localStorage.getItem("quorum_rounds")
    if (savedRounds) { const n = parseInt(savedRounds, 10); if ([1, 2, 3, 5].includes(n)) setMaxRounds(n) }
  }, [])

  /* ── Header dropdown close on outside click ── */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-header-dropdown]")) setShowDropdown(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  /* ── Model toggle (setup phase, enforces min 2) ── */
  const toggleSetupModel = useCallback((model: Provider) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) {
        return prev.length > 2 ? prev.filter((m) => m !== model) : prev
      }
      return prev.length < 4 ? [...prev, model] : prev
    })
  }, [])

  /* ── Login gate recovery from sessionStorage ── */
  const [configHydrated, setConfigHydrated] = useState(false)
  const initialPromptSent = useRef(false)
  const pendingPrompt = useRef<{ prompt: string; models: Provider[] } | null>(null)

  useEffect(() => {
    // Check for pending debate from login gate
    const pending = sessionStorage.getItem("quorum_pending")
    if (pending) {
      sessionStorage.removeItem("quorum_pending")
      sessionStorage.removeItem("quorum_config")
      sessionStorage.removeItem("quorum_file_warnings")
      try {
        const config = JSON.parse(pending)
        if (config.models?.length) setSelectedModels(config.models)
        if (config.responseLength) setResponseLength(config.responseLength)
        if (config.rounds) setMaxRounds(config.rounds)
        if (config.locale) setLocale(config.locale)
        const textToShow = config.originalPrompt || config.prompt || ""
        if (textToShow) setPrefillPrompt(textToShow)
        if (config.hadFiles) {
          const reattachMsg = config.locale === "ko"
            ? "\uB85C\uADF8\uC778 \uC804\uC5D0 \uCCA8\uBD80\uD55C \uD30C\uC77C\uC744 \uB2E4\uC2DC \uCCA8\uBD80\uD574\uC8FC\uC138\uC694"
            : "Please re-attach files from before login"
          setFileWarning(reattachMsg)
        }
      } catch { /* ignore */ }
      setConfigHydrated(true)
      return
    }

    // Check for legacy quorum_config (from old homepage -> chat flow, or external links)
    const raw = sessionStorage.getItem("quorum_config")
    if (raw) {
      sessionStorage.removeItem("quorum_config")
      try {
        const config = JSON.parse(raw) as {
          prompt?: string; models?: Provider[]; responseLength?: ResponseLength; rounds?: number; locale?: Locale
        }
        const warningsRaw = sessionStorage.getItem("quorum_file_warnings")
        if (warningsRaw) {
          sessionStorage.removeItem("quorum_file_warnings")
          try {
            const parsed = JSON.parse(warningsRaw)
            if (Array.isArray(parsed)) {
              const joined = parsed.filter((w): w is string => typeof w === "string").join("\n")
              if (joined) setFileWarning(joined)
            }
          } catch { /* ignore */ }
        }
        if (config.models?.length) {
          setSelectedModels(config.models)
          dispatch({ type: "SET_MODELS", models: config.models })
        }
        if (config.responseLength) setResponseLength(config.responseLength)
        if (config.rounds) setMaxRounds(config.rounds)
        if (config.locale) setLocale(config.locale)
        if (config.prompt) {
          pendingPrompt.current = { prompt: config.prompt, models: config.models ?? DEFAULT_MODELS }
        }
      } catch { /* ignore */ }
    }
    setConfigHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fire pending prompt (from legacy quorum_config) after state settled
  useEffect(() => {
    if (!configHydrated) return
    if (pendingPrompt.current && !initialPromptSent.current) {
      initialPromptSent.current = true
      const { prompt: p, models } = pendingPrompt.current
      pendingPrompt.current = null
      setPhase("active")
      setTimeout(() => handleSendRef.current(p, "all", models), 0)
    }
  }, [configHydrated, handleSendRef])

  /* ── Setup submit handler ── */
  const handleSetupSubmit = useCallback((info: SetupSubmitInfo) => {
    if (shouldShowLoginGate(isLoggedIn)) {
      savePendingDebate({
        prompt: info.messageText,
        originalPrompt: info.originalPrompt,
        hadFiles: info.hadFiles,
        models: selectedModels,
        responseLength,
        rounds: maxRounds,
        locale,
      })
      setShowGate(true)
      return
    }

    if (info.fileWarnings.length > 0) {
      setFileWarning(info.fileWarnings.join("\n"))
    }

    // Set models on the engine and send
    dispatch({ type: "SET_MODELS", models: selectedModels })
    setPhase("active")
    setTimeout(() => handleSendRef.current(info.messageText, "all", selectedModels), 0)
  }, [isLoggedIn, selectedModels, responseLength, maxRounds, locale, dispatch, handleSendRef])

  /* ── Persistence refs ── */
  const creatingThreadRef = useRef(false)
  const prevMessageCount = useRef(0)
  const isHydratingRef = useRef(false)
  const threadLoaded = useRef<string | null>(null)

  // Auto-save messages when new ones are added
  useEffect(() => {
    if (!persistence.isLoggedIn) return
    if (isHydratingRef.current) { prevMessageCount.current = state.messages.length; return }
    if (state.messages.length <= prevMessageCount.current) { prevMessageCount.current = state.messages.length; return }
    prevMessageCount.current = state.messages.length

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
            const params = new URLSearchParams(window.location.search)
            params.set("thread", id)
            router.replace(`${window.location.pathname}?${params.toString()}`)
          }
        })
        return
      }
    }

    if (state.showSummary && state.messages[state.messages.length - 1]?.sender === "verdict") return
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && !lastMsg.content && lastMsg.sender !== "user" && lastMsg.sender !== "system" && lastMsg.sender !== "verdict") return
    persistence.saveMessages(state.messages)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages.length])

  // Save when debate ends
  useEffect(() => {
    if (isHydratingRef.current) return
    if (!state.isDebating && state.messages.length > 0 && persistence.threadId.current) {
      persistence.saveMessages(state.messages)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isDebating])

  // Auto-save verdict
  useEffect(() => {
    if (isHydratingRef.current) return
    if (state.showSummary && state.verdict && persistence.threadId.current) {
      const doSave = async () => {
        await persistence.saveMessages(state.messages)
        const afterIndex = state.messages.length - 1
        await persistence.saveVerdict(state.verdict!, afterIndex)
      }
      doSave()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showSummary])


  /* ── New debate ── */
  const handleNewDebate = useCallback(() => {
    creatingThreadRef.current = false
    threadLoaded.current = null
    prevMessageCount.current = 0
    persistence.reset()
    handleReset()
    // Stay in active phase with cleared thread
    router.replace("/")
  }, [persistence, handleReset, router])

  /* ── Leave debate (back to setup) ── */
  const handleLeaveToSetup = useCallback(() => {
    setShowBackConfirm(false)
    handleStop()
    leavingRef.current = true
    guardPushedRef.current = false
    creatingThreadRef.current = false
    threadLoaded.current = null
    prevMessageCount.current = 0
    persistence.reset()
    handleReset()
    setPhase("setup")
    leavingRef.current = false
    router.replace("/")
  }, [handleStop, handleReset, persistence, router])

  // Continue thread effect
  const prevShowSummary = useRef(state.showSummary)
  useEffect(() => {
    if (prevShowSummary.current && !state.showSummary) persistence.continueThread()
    prevShowSummary.current = state.showSummary
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.showSummary])

  // Load thread from URL
  useEffect(() => {
    if (!threadParam || threadLoaded.current === threadParam || !persistence.isLoggedIn) return
    threadLoaded.current = threadParam
    creatingThreadRef.current = false
    isHydratingRef.current = true
    prevMessageCount.current = 0
    setIsLoadingThread(true)
    setPhase("active")
    handleReset()
    prevShowSummary.current = false

    persistence.loadThread(threadParam).then((thread) => {
      if (!thread) {
        isHydratingRef.current = false
        threadLoaded.current = null
        setIsLoadingThread(false)
        return
      }

      const rawMessages: Message[] = thread.messages.map((m: { id: string; sender: string; displayName: string; content: string; createdAt: string }) => ({
        id: `db-${m.id}`,
        sender: m.sender as Message["sender"],
        displayName: m.displayName,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }))

      for (const verdict of thread.verdicts) {
        const verdictMsg = rawMessages.find(
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
            ...(verdict.analysis ? { analysis: verdict.analysis } : {}),
            ...(verdict.keyTakeaways?.length ? { keyTakeaways: verdict.keyTakeaways } : {}),
            ...(verdict.actionItems?.length ? { actionItems: verdict.actionItems } : {}),
          }
        }
      }

      const messages: Message[] = rawMessages.filter(
        (m) => !(m.sender === "system" && (m.content === SYSTEM_MESSAGES.analyzing("en") || m.content === SYSTEM_MESSAGES.analyzing("ko")))
      )

      const lastVerdict = thread.verdicts[thread.verdicts.length - 1]
      const verdictResult: VerdictResult | null = lastVerdict
        ? {
            recommendedAnswer: lastVerdict.recommendation,
            voteSplit: lastVerdict.voteSplit,
            confidence: lastVerdict.confidence,
            reasons: lastVerdict.reasons,
            minorityView: lastVerdict.minorityView,
            oppositeCase: lastVerdict.oppositeCase,
            ...(lastVerdict.analysis ? { analysis: lastVerdict.analysis } : {}),
            ...(lastVerdict.keyTakeaways?.length ? { keyTakeaways: lastVerdict.keyTakeaways } : {}),
            ...(lastVerdict.actionItems?.length ? { actionItems: lastVerdict.actionItems } : {}),
          }
        : null

      if (thread.models?.length) dispatch({ type: "SET_MODELS", models: thread.models })
      if (thread.responseLength) setResponseLength(thread.responseLength)
      if (thread.rounds) setMaxRounds(thread.rounds)
      if (thread.locale) setLocale(thread.locale)

      dispatch({ type: "HYDRATE_THREAD", messages, verdict: verdictResult, showSummary: thread.status === "complete" })
      dispatch({ type: "SET_THREAD_ID", id: thread.id })
      prevMessageCount.current = messages.length
      setTimeout(() => { isHydratingRef.current = false; setIsLoadingThread(false) }, 0)
    }).catch((err) => {
      console.error("[thread] Failed to load thread:", err)
      isHydratingRef.current = false
      threadLoaded.current = null
      setIsLoadingThread(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam, persistence.isLoggedIn, handleReset])

  // Increment free-debate counter after verdict
  const hasIncrementedRef = useRef(false)
  useEffect(() => {
    if (state.showSummary && !persistence.isLoggedIn && !hasIncrementedRef.current) {
      hasIncrementedRef.current = true
      incrementDebateCount()
    }
    if (!state.showSummary) hasIncrementedRef.current = false
  }, [state.showSummary, persistence.isLoggedIn])

  /* ============================================
     RENDER
  ============================================ */

  /* ── Shared header pieces ── */
  const themeIconMap: Record<Theme, { key: string; icon: React.ElementType; motion: Record<string, unknown> }> = {
    light: { key: "sun", icon: Sun, motion: { initial: { scale: 0, rotate: -90 }, animate: { scale: 1, rotate: 0 }, exit: { scale: 0, rotate: 90 }, whileHover: { rotate: [0, 360], transition: { duration: 3, repeat: Infinity, ease: "linear" } } } },
    dark: { key: "moon", icon: Moon, motion: { initial: { scale: 0, rotate: -90 }, animate: { scale: 1, rotate: 0 }, exit: { scale: 0, rotate: 90 }, whileHover: { rotate: [0, -15, 15, -15, 0], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } } } },
    tokyonight: { key: "star", icon: Star, motion: { initial: { scale: 0 }, animate: { scale: 1 }, exit: { scale: 0 }, whileHover: { scale: [1, 1.3, 1], transition: { duration: 1, repeat: Infinity, ease: "easeInOut" } } } },
    lovelace: { key: "heart", icon: Heart, motion: { initial: { scale: 0 }, animate: { scale: 1 }, exit: { scale: 0 }, whileHover: { scale: [1, 1.2, 1, 1.15, 1], transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" } } } },
    gruvbox: { key: "flame", icon: Flame, motion: { initial: { scale: 0, y: 5 }, animate: { scale: 1, y: 0 }, exit: { scale: 0, y: 5 }, whileHover: { y: [0, -2, 0, -1, 0], scale: [1, 1.15, 1, 1.1, 1], transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" } } } },
    catppuccin: { key: "cat", icon: Cat, motion: { initial: { scale: 0, rotate: 15 }, animate: { scale: 1, rotate: 0 }, exit: { scale: 0, rotate: -15 }, whileHover: { rotate: [0, -10, 10, -5, 0], y: [0, -1, 0], transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" } } } },
    nord: { key: "snowflake", icon: Snowflake, motion: { initial: { scale: 0, rotate: 60 }, animate: { scale: 1, rotate: 0 }, exit: { scale: 0, rotate: -60 }, whileHover: { rotate: [0, 180, 360], scale: [1, 1.15, 1], transition: { duration: 2, repeat: Infinity, ease: "linear" } } } },
    solarized: { key: "solar", icon: Sunrise, motion: { initial: { scale: 0, y: 4 }, animate: { scale: 1, y: 0 }, exit: { scale: 0, y: -4 }, whileHover: { y: [0, -3, 0], scale: [1, 1.15, 1], transition: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } } } },
  }

  const themeRingClass = cn(
    theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#eb6f92]/60",
    theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40",
    theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50",
    theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50",
    theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50",
    theme === "solarized" && "hover:ring-[1.5px] hover:ring-[#073642]/50",
  )

  const renderThemeButton = () => {
    const { key, icon: Icon, motion: motionProps } = themeIconMap[theme]
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        whileHover={{ scale: 1.05 }}
        onClick={toggleTheme}
        className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all group", themeRingClass)}
        aria-label="Toggle theme"
      >
        <AnimatePresence mode="popLayout">
          <motion.div key={key} {...motionProps} transition={{ duration: 0.2 }}>
            <Icon className={cn("w-3.5 h-3.5", theme === "solarized" ? "text-[#b58900]" : "text-zinc-600 dark:text-zinc-400")} />
          </motion.div>
        </AnimatePresence>
      </motion.button>
    )
  }

  const renderLocaleButton = () => (
    <motion.button
      whileTap={{ scale: 0.95 }}
      whileHover={{ scale: 1.05 }}
      onClick={toggleLocale}
      className={cn("cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors rounded-md px-1", themeRingClass)}
    >
      {locale === "en" ? "EN" : "KO"}
    </motion.button>
  )

  const renderAuthSection = () => {
    if (isLoggedIn) {
      return (
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className={cn("flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-default group", themeRingClass)}
          >
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] sm:text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">1,250</span>
          </motion.div>

          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setIsSettingsOpen(true)}
            className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm", themeRingClass)}
            aria-label="Settings"
          >
            <Settings2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
          </motion.button>

          <div className="relative" data-header-dropdown>
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowDropdown(!showDropdown)}
              className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm", themeRingClass)}
            >
              <User className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
            </motion.button>
            <AnimatePresence>
              {showDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60]"
                >
                  <div className="p-1">
                    <button
                      onClick={() => { setShowDropdown(false); signOut() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      {locale === "ko" ? "\uB85C\uADF8\uC544\uC6C3" : "Sign Out"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.05 }}
          onClick={() => setIsSettingsOpen(true)}
          className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm", themeRingClass)}
          aria-label="Settings"
        >
          <Settings2 className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => signIn("google")}
          className="flex items-center justify-center gap-2 h-7 w-7 sm:h-8 sm:w-auto sm:px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm"
        >
          <LogIn className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs font-bold">{locale === "ko" ? "\uB85C\uADF8\uC778" : "Sign In"}</span>
        </motion.button>
      </div>
    )
  }

  /* ── Setup header ── */
  const renderSetupHeader = () => (
    <header className="relative z-30 flex justify-between items-center p-4 sm:p-6 md:p-8 w-full max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setPhase("setup"); router.replace("/") }}
          className="font-semibold tracking-tight text-base sm:text-lg flex items-center gap-2 hover:opacity-70 transition-opacity"
        >
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm bg-zinc-900 dark:bg-zinc-100" />
          Quorum
        </button>
        {isLoggedIn && (
          <ThreadDropdown
            currentThreadId={null}
            currentTitle={locale === "ko" ? "\uCD5C\uADFC \uD1A0\uB860" : "History"}
            locale={locale}
            onNewDebate={() => {
              handleReset()
              persistence.reset()
              setPhase("setup")
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-3 sm:gap-5">
        {renderLocaleButton()}
        {renderThemeButton()}
        <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />
        {renderAuthSection()}
      </div>
    </header>
  )

  return (
    <div key={mountKey} className="relative flex flex-col h-screen bg-background overflow-hidden font-[family-name:var(--font-geist-sans)] text-foreground transition-colors duration-200">
      <AnimatePresence initial={false} mode="popLayout">
        {phase === "setup" ? (
          <motion.div
            key="setup"
            className="flex flex-col h-full"
            variants={setupVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {renderSetupHeader()}
            <SetupView
              locale={locale}
              selectedModels={selectedModels}
              onToggleModel={toggleSetupModel}
              responseLength={responseLength}
              onResponseLengthChange={(len) => { setResponseLength(len); localStorage.setItem("quorum_responseLength", len) }}
              rounds={maxRounds}
              onRoundsChange={(r) => { setMaxRounds(r); localStorage.setItem("quorum_rounds", String(r)) }}
              onSubmit={handleSetupSubmit}
              initialPrompt={prefillPrompt}
            />
          </motion.div>
        ) : (
          <motion.div
            key="active"
            className="flex flex-col h-full"
            variants={activeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <ChatHeader
              currentRound={state.currentRound}
              maxRounds={maxRounds}
              responseLength={responseLength}
              onChangeResponseLength={(len) => { setResponseLength(len); localStorage.setItem("quorum_responseLength", len) }}
              onChangeRounds={(rounds: number) => { setMaxRounds(rounds); localStorage.setItem("quorum_rounds", String(rounds)) }}
              activeModels={state.activeModels}
              onToggleModel={(m) => dispatch({ type: "TOGGLE_MODEL", model: m })}
              locale={locale}
              theme={theme}
              onToggleTheme={toggleTheme}
              onOpenSettings={() => setIsSettingsOpen(true)}
              isDebating={state.isDebating}
              threadId={state.threadId}
              onNewDebate={handleNewDebate}
              onDeleteCurrent={handleNewDebate}
              onStopDebate={handleStop}
              onLogoClick={handleLeaveToSetup}
            />

            {/* Scrollable message area */}
            <main
              ref={mainRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative thin-scrollbar scroll-smooth"
              onScroll={() => {
                const el = mainRef.current
                if (!el) return
                const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
                setShowScrollDown(distFromBottom > 200)
              }}
            >
              {isLoadingThread ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
                    <span className="text-sm text-zinc-400 dark:text-zinc-500">
                      {locale === "ko" ? "\uBD88\uB7EC\uC624\uB294 \uC911..." : "Loading..."}
                    </span>
                  </div>
                </div>
              ) : (
                <ChatThread
                  messages={state.messages}
                  typingModel={state.typingModel}
                  isDebating={state.isDebating}
                  locale={locale}
                  activeModels={state.activeModels}
                  responseLength={responseLength}
                  onSendMessage={(text) => handleSend(text, "all")}
                  onNewDiscussion={handleNewDebate}
                />
              )}
            </main>

            <button
              onClick={() => mainRef.current?.scrollTo({ top: mainRef.current.scrollHeight, behavior: "smooth" })}
              className={`absolute left-1/2 -translate-x-1/2 bottom-20 sm:bottom-24 w-8 h-8 rounded-full bg-zinc-500/20 dark:bg-zinc-400/15 backdrop-blur-sm text-zinc-500 dark:text-zinc-400 flex items-center justify-center hover:bg-zinc-500/30 dark:hover:bg-zinc-400/25 transition-all duration-200 z-30 ${showScrollDown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Bottom bar */}
            <div className="w-full shrink-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-2 z-10">
              {(state.isDebating || state.typingModel !== null || state.verdict !== null) && (
                <ConsensusMeter
                  score={state.verdict?.confidence ?? null}
                  result={state.showSummary ? state.verdict : null}
                  locale={locale}
                />
              )}
              <MessageInput
                onSend={handleSend}
                onStop={handleStop}
                disabled={state.isDebating}
                locale={locale}
                initialFileWarning={fileWarning}
                initialText={prefillText}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals (always available regardless of phase) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        locale={locale}
        onToggleLocale={toggleLocale}
        activeModels={phase === "setup" ? selectedModels : state.activeModels}
        onToggleModel={phase === "setup" ? toggleSetupModel : (m) => dispatch({ type: "TOGGLE_MODEL", model: m })}
        isDebating={state.isDebating}
        theme={theme}
        onChangeTheme={changeTheme}
      />

      {showGate && <LoginGateModal onClose={() => setShowGate(false)} locale={locale} />}

      <ConfirmDialog
        isOpen={showBackConfirm}
        title={leaveDebateStrings[locale].leaveTitle}
        description={leaveDebateStrings[locale].leaveDesc}
        confirmLabel={leaveDebateStrings[locale].leaveConfirm}
        cancelLabel={leaveDebateStrings[locale].leaveCancel}
        onConfirm={handleLeaveToSetup}
        onCancel={() => setShowBackConfirm(false)}
        destructive
      />
    </div>
  )
}
