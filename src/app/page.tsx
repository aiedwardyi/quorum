"use client"

import { Suspense, useCallback, useRef, useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { THEMES } from "@/types"
import type { Provider, Locale, ResponseLength, Theme, Message, VerdictResult } from "@/types"
import { useDebateEngine, SYSTEM_MESSAGES } from "@/hooks/useDebateEngine"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import ChatHeader, { leaveDebateStrings } from "@/components/Header"
import ConfirmDialog from "@/components/ConfirmDialog"
import dynamic from "next/dynamic"
const SettingsModal = dynamic(() => import("@/components/SettingsModal"), { ssr: false })
const BuyDebatesModal = dynamic(() => import("@/components/BuyDebatesModal"), { ssr: false })
const UpgradePrompt = dynamic(() => import("@/components/UpgradePrompt"), { ssr: false })
import { ChevronDown } from "lucide-react"
import { useThreadPersistence } from "@/hooks/useThreadPersistence"
import { useDebateBalance } from "@/hooks/useDebateBalance"

// Keep in sync with DEFAULT_MODELS in useDebateEngine.ts. Gemini sits
// last historically because Pro's TTFT was slowest; chat now runs on
// 2.5 Flash which is much faster, but we keep the order for now until
// we re-validate rotation timing end-to-end.
const DEFAULT_MODELS: Provider[] = ["perplexity", "claude", "gpt", "gemini"]

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageContent />
    </Suspense>
  )
}

function ChatPageContent() {
  // Config loaded from sessionStorage (set by homepage)
  const [locale, setLocale] = useState<Locale>("ko")
  const [responseLength, setResponseLength] = useState<ResponseLength>("short")
  const [maxRounds, setMaxRounds] = useState(1)
  const [theme, setTheme] = useState<Theme>("dark")
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [upgradePrompt, setUpgradePrompt] = useState<{ show: boolean; variant: "signup" | "buy" }>({ show: false, variant: "buy" })
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [fileWarning, setFileWarning] = useState<string | null>(null)
  const [prefillText, setPrefillText] = useState<string | null>(null)

  const { state, dispatch, handleSend, handleStop, handleReset, handleSendRef } =
    useDebateEngine({ locale, responseLength, maxRounds })

  const persistence = useThreadPersistence()
  const debateBalance = useDebateBalance()
  const router = useRouter()

  const searchParams = useSearchParams()
  const threadParam = searchParams.get("thread")

  const mainRef = useRef<HTMLElement>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  // Ref so the early auto-send effect can call through the gate
  const handleSendWithGateRef = useRef<(text: string, target: Provider | "all") => void>(() => {})
  // Bumped on bfcache restore to force framer-motion remount
  const [mountKey, setMountKey] = useState(0)

  // Warn before browser back/refresh/tab close during active debate
  const [showBackConfirm, setShowBackConfirm] = useState(false)
  const isDebatingRef = useRef(state.isDebating)
  const allowBackRef = useRef(false)
  const guardPushedRef = useRef(false)
  // When true, popstate handlers skip everything so a confirmed leave
  // flow can navigate (router.replace) without re-triggering the
  // back-confirmation dialog.
  const leavingRef = useRef(false)
  isDebatingRef.current = state.isDebating

  useEffect(() => {
    if (!state.isDebating) {
      // Clean up guard entry when debate ends naturally (not during navigation)
      if (guardPushedRef.current && history.state?.debateGuard) {
        guardPushedRef.current = false
        allowBackRef.current = true
        history.back()
      } else {
        guardPushedRef.current = false
      }
      return
    }

    // Push a guard entry so we can intercept back navigation
    history.pushState({ debateGuard: true }, "")
    guardPushedRef.current = true

    const handlePopState = () => {
      if (leavingRef.current) return
      if (allowBackRef.current) {
        allowBackRef.current = false
        return
      }
      if (isDebatingRef.current) {
        history.pushState({ debateGuard: true }, "")
        setShowBackConfirm(true)
      }
    }
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }

    window.addEventListener("popstate", handlePopState)
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("popstate", handlePopState)
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [state.isDebating])

  // Apply theme classes to <html>
  useEffect(() => {
    const cl = document.documentElement.classList
    cl.remove(...THEMES.filter((t) => t !== "light"))
    const isLightTheme = theme === "light" || theme === "solarized"
    if (!isLightTheme) {
      cl.add("dark")
      if (theme !== "dark") cl.add(theme)
    } else if (theme === "solarized") {
      cl.add("solarized")
    }
  }, [theme])

  // BUG-015: Re-apply theme when page becomes visible again
  // (handles bfcache restore, Next.js client-side back/forward, and tab switching)
  useEffect(() => {
    const reapplyTheme = () => {
      let saved = localStorage.getItem("quorum_theme") as string | null
      if (saved === "github") { saved = "solarized"; localStorage.setItem("quorum_theme", "solarized") }
      if (saved && (THEMES as readonly string[]).includes(saved)) {
        setTheme(saved as Theme)
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
    let savedTheme = localStorage.getItem("quorum_theme") as string | null
    if (savedTheme === "github") { savedTheme = "solarized"; localStorage.setItem("quorum_theme", "solarized") }
    if (savedTheme && (THEMES as readonly string[]).includes(savedTheme)) {
      setTheme(savedTheme as Theme)
    }

    const savedLocale = localStorage.getItem("quorum_locale") as string | null
    if (savedLocale === "en" || savedLocale === "ko") {
      setLocale(savedLocale)
    }

    const savedLength = localStorage.getItem("quorum_responseLength") as string | null
    if (savedLength === "short" || savedLength === "medium" || savedLength === "long") {
      setResponseLength(savedLength)
    }

    const savedRounds = localStorage.getItem("quorum_rounds")
    if (savedRounds) {
      const n = parseInt(savedRounds, 10)
      if ([1, 2, 3, 5].includes(n)) setMaxRounds(n)
    }

    // Check for pending debate from login gate (must be before quorum_config early return)
    const pending = sessionStorage.getItem("quorum_pending")
    if (pending) {
      sessionStorage.removeItem("quorum_pending")
      // Clear stale quorum_config so it doesn't auto-send over our prefill
      sessionStorage.removeItem("quorum_config")
      sessionStorage.removeItem("quorum_file_warnings")
      try {
        const config = JSON.parse(pending)
        if (config.models?.length) dispatch({ type: "SET_MODELS", models: config.models })
        if (config.responseLength) setResponseLength(config.responseLength)
        if (config.rounds) setMaxRounds(config.rounds)
        if (config.locale) setLocale(config.locale)
        // Prefill the text box with the original prompt instead of auto-sending
        const textToShow = config.originalPrompt || config.prompt || ""
        if (textToShow) setPrefillText(textToShow)
        if (config.hadFiles) {
          const reattachMsg = config.locale === "ko"
            ? "로그인 전에 첨부한 파일을 다시 첨부해주세요"
            : "Please re-attach files from before login"
          setFileWarning(reattachMsg)
        }
      } catch { /* ignore */ }
      setConfigHydrated(true)
      return
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

  // Fire pending prompt after state has settled - goes through the gate
  // so balance is checked and deducted before starting the debate.
  useEffect(() => {
    if (!configHydrated) return
    if (pendingPrompt.current && !initialPromptSent.current) {
      initialPromptSent.current = true
      const { prompt: p } = pendingPrompt.current
      pendingPrompt.current = null
      setTimeout(() => handleSendWithGateRef.current(p, "all"), 0)
    }
  }, [configHydrated])

  // Handle purchase success redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("purchase") === "success") {
      setTimeout(() => debateBalance.refresh(), 1500)
      window.history.replaceState({}, "", "/")
    }
  }, [])

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

  // Persistence-related refs
  const creatingThreadRef = useRef(false)
  const prevMessageCount = useRef(0)
  const isHydratingRef = useRef(false)
  const threadLoaded = useRef<string | null>(null)

  // Auto-save messages when new ones are added
  useEffect(() => {
    if (!persistence.isLoggedIn) return
    if (isHydratingRef.current) {
      prevMessageCount.current = state.messages.length
      return
    }
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
            // Don't save here — auto-save handles it on next trigger,
            // avoiding saving empty AI placeholders during thread creation.
          }
        })
        return
      }
    }

    // Skip verdict message batch — verdict-save effect handles it sequentially
    if (state.showSummary && state.messages[state.messages.length - 1]?.sender === "verdict") {
      return
    }

    // Don't save while an AI message is still streaming (empty placeholder).
    // The next ADD_MESSAGE trigger will include the now-complete message.
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && !lastMsg.content && lastMsg.sender !== "user" && lastMsg.sender !== "system" && lastMsg.sender !== "verdict") {
      return
    }

    // Otherwise save incrementally
    persistence.saveMessages(state.messages)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.messages.length])

  // Save messages when debate ends (covers stop, single-model, and normal completion)
  useEffect(() => {
    if (isHydratingRef.current) return
    if (!state.isDebating && !state.showSummary && state.messages.length > 0 && persistence.threadId.current) {
      persistence.saveMessages(state.messages)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isDebating])

  // Auto-save verdict when summary is shown (save messages first to avoid version race)
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

  const handleNewDebate = useCallback(() => {
    creatingThreadRef.current = false
    threadLoaded.current = null
    prevMessageCount.current = 0
    persistence.reset()
    handleReset()
    mainRef.current?.scrollTo({ top: 0 })
    router.replace("/")
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
  useEffect(() => {
    if (!threadParam || threadLoaded.current === threadParam || !persistence.isLoggedIn) return
    threadLoaded.current = threadParam
    creatingThreadRef.current = false
    isHydratingRef.current = true
    prevMessageCount.current = 0
    setIsLoadingThread(true)
    handleReset()
    // Prevent the continue-thread effect from misinterpreting this reset
    // as the user continuing a completed thread
    prevShowSummary.current = false

    persistence.loadThread(threadParam).then((thread) => {
      if (!thread) {
        isHydratingRef.current = false
        threadLoaded.current = null
        setIsLoadingThread(false)
        return
      }

      // Rebuild client messages from DB records
      const rawMessages: Message[] = thread.messages.map((m: { id: string; sender: string; displayName: string; content: string; createdAt: string }) => ({
        id: `db-${m.id}`,
        sender: m.sender as Message["sender"],
        displayName: m.displayName,
        content: m.content,
        timestamp: new Date(m.createdAt),
      }))

      // Inject verdict data into verdict messages using the original
      // indices from the DB record. Verdict.afterMessageIndex was
      // captured against the full message list (including the
      // analyzing divider that we are about to strip below), so the
      // lookup must run on rawMessages, not on the filtered list.
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

      // Strip stale "Analyzing discussion..." system dividers. These
      // were persisted during the live debate (saveMessages is
      // append-only and the post-verdict UPDATE_MESSAGE that clears
      // them to empty content never gets written back to the DB). On
      // a completed thread the analyzing phase is over, so rendering
      // the divider plus its VerdictSkeleton above the real verdict
      // card is a stale-state artifact. For in-progress threads, the
      // engine cannot resume the pending consensus request anyway, so
      // the divider is also stale there.
      const messages: Message[] = rawMessages.filter(
        (m) =>
          !(
            m.sender === "system" &&
            (m.content === SYSTEM_MESSAGES.analyzing("en") ||
              m.content === SYSTEM_MESSAGES.analyzing("ko"))
          )
      )

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
            ...(lastVerdict.analysis ? { analysis: lastVerdict.analysis } : {}),
            ...(lastVerdict.keyTakeaways?.length ? { keyTakeaways: lastVerdict.keyTakeaways } : {}),
            ...(lastVerdict.actionItems?.length ? { actionItems: lastVerdict.actionItems } : {}),
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

  // Anonymous debate counting is now handled by deductAnonymous() in handleSendWithGate

  // Sync activeModels with allowedModels so locked models can't stay enabled
  const allowedModelsKey = debateBalance.allowedModels.join(",")
  useEffect(() => {
    if (debateBalance.loading) return
    const allowed = new Set(debateBalance.allowedModels)
    const filtered = state.activeModels.filter((m) => allowed.has(m))
    // If too few remain, fall back to all allowed models
    const next = filtered.length >= 2 ? filtered : [...debateBalance.allowedModels]
    if (next.length !== state.activeModels.length || next.some((m, i) => m !== state.activeModels[i])) {
      dispatch({ type: "SET_MODELS", models: next })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateBalance.loading, allowedModelsKey])

  // Gate: check balance + deduct before sending
  const handleSendWithGate = useCallback(async (text: string, target: Provider | "all") => {
    // Wait for balance data before gating - prevents false "model_locked" from stale fallback
    if (debateBalance.loading) return

    const models = state.activeModels
    const check = debateBalance.canStartDebate(models)

    if (!check.allowed) {
      if (check.reason === "signup") {
        setUpgradePrompt({ show: true, variant: "signup" })
        return
      }
      if (check.reason === "no_debates" || check.reason === "model_locked") {
        setUpgradePrompt({ show: true, variant: "buy" })
        return
      }
      return
    }

    // Anonymous: deduct from localStorage (sync)
    if (!debateBalance.isLoggedIn) {
      debateBalance.deductAnonymous()
    }

    // Start debate immediately - deduct optimistically in background
    handleSend(text, target)

    // Server-side deduction for logged-in users (non-blocking)
    if (debateBalance.isLoggedIn) {
      fetch("/api/debates/deduct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ models, threadId: persistence.threadId.current }),
      })
        .then((res) => {
          if (!res.ok) {
            handleStop()
            setUpgradePrompt({ show: true, variant: "buy" })
          }
          debateBalance.refresh()
        })
        .catch(() => {
          handleStop()
          setUpgradePrompt({ show: true, variant: "buy" })
        })
    }
  }, [state.activeModels, debateBalance, handleSend, handleStop, persistence.threadId])
  handleSendWithGateRef.current = handleSendWithGate

  /* ---- Render ---- */

  return (
    <div key={mountKey} className="relative flex flex-col h-dvh bg-background overflow-hidden font-[family-name:var(--font-geist-sans)] text-foreground transition-colors duration-200">
      <ChatHeader
        currentRound={state.currentRound}
        maxRounds={maxRounds}
        responseLength={responseLength}
        onChangeResponseLength={(len) => { setResponseLength(len); localStorage.setItem("quorum_responseLength", len) }}
        onChangeRounds={(rounds: number) => {
          setMaxRounds(rounds)
          localStorage.setItem("quorum_rounds", String(rounds))
        }}
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
        debateBalance={debateBalance.balance}
        freeDebatesRemaining={debateBalance.freeDebatesRemaining}
        tier={debateBalance.tier}
        allowedModels={debateBalance.loading ? undefined : debateBalance.allowedModels}
        balanceLoading={debateBalance.loading}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        locale={locale}
        onToggleLocale={() => setLocale((l) => {
          const next = l === "en" ? "ko" : "en"
          localStorage.setItem("quorum_locale", next)
          return next
        })}
        activeModels={state.activeModels}
        onToggleModel={(m) => dispatch({ type: "TOGGLE_MODEL", model: m })}
        isDebating={state.isDebating}
        theme={theme}
        onChangeTheme={changeTheme}
        onBuyDebates={() => { setIsSettingsOpen(false); setShowBuyModal(true) }}
        balance={debateBalance.balance}
        freeDebatesRemaining={debateBalance.freeDebatesRemaining}
        tier={debateBalance.tier}
        allowedModels={debateBalance.loading ? undefined : debateBalance.allowedModels}
      />

      <BuyDebatesModal
        isOpen={showBuyModal}
        onClose={() => { setShowBuyModal(false); debateBalance.refresh() }}
        locale={locale}
      />

      <UpgradePrompt
        isOpen={upgradePrompt.show}
        onClose={() => setUpgradePrompt({ show: false, variant: "buy" })}
        variant={upgradePrompt.variant}
        onBuyDebates={() => setShowBuyModal(true)}
        onSignUp={() => signIn("google")}
        locale={locale}
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
                {locale === "ko" ? "불러오는 중..." : "Loading..."}
              </span>
            </div>
          </div>
        ) : (
          <ChatThread
            messages={state.messages}
            typingModel={state.typingModel}
            isDebating={state.isDebating}
            locale={locale}
            responseLength={responseLength}
            onSendMessage={(text) => handleSendWithGate(text, "all")}
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

      {/* Bottom bar: consensus rail + input */}
      <div className="w-full shrink-0 bg-gradient-to-t from-[var(--background)] via-[var(--background)] to-transparent pt-2 z-10">
        {(state.isDebating || state.typingModel !== null || state.verdict !== null) && (
          <ConsensusMeter
            score={state.verdict?.confidence ?? null}
            result={state.showSummary ? state.verdict : null}
            locale={locale}
          />
        )}

        <MessageInput
          onSend={handleSendWithGate}
          onStop={handleStop}
          disabled={state.isDebating}
          locale={locale}
          initialFileWarning={fileWarning}
          initialText={prefillText}
        />
      </div>

      <ConfirmDialog
        isOpen={showBackConfirm}
        title={leaveDebateStrings[locale].leaveTitle}
        description={leaveDebateStrings[locale].leaveDesc}
        confirmLabel={leaveDebateStrings[locale].leaveConfirm}
        cancelLabel={leaveDebateStrings[locale].leaveCancel}
        onConfirm={() => {
          setShowBackConfirm(false)
          handleStop()
          // Leaving flag so the popstate listener ignores the navigation
          // we are about to trigger and never re-shows the dialog.
          leavingRef.current = true
          guardPushedRef.current = false
          // Navigate directly to home via Next.js router instead of
          // counting history entries and calling history.go(-N). The
          // previous history.go(-2) approach assumed exactly two guard
          // entries had been pushed, which held during Gemini's thinking
          // phase but broke once additional renders pushed more entries
          // after the first bubble finished streaming, leaving the user
          // stranded on a middle chat entry that required a second
          // back-click. router.replace is independent of stack depth.
          router.replace("/")
        }}
        onCancel={() => setShowBackConfirm(false)}
        destructive
      />
    </div>
  )
}
