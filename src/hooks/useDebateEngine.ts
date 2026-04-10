"use client"

import { useReducer, useCallback, useRef, useEffect } from "react"
import type { Message, Provider, VerdictResult, Locale, ResponseLength } from "@/types"
import { cleanResponse } from "@/lib/clean-response"
import { hasDirectUrlReference, prioritizePerplexity } from "@/lib/url-access"

/* ---- Constants ---- */

const MODEL_TIMEOUT_MS = 30_000

/* ---- Logging ---- */

function logDebate(event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.log(`[debate] ${event}`, data ?? "")
  }
}

export const DISPLAY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
  gpt: "GPT",
}

const SYSTEM_DISPLAY_NAMES: Record<Locale, string> = {
  en: "System",
  ko: "시스템",
}

const SYSTEM_MESSAGES = {
  round: (locale: Locale, round: number) =>
    locale === "ko" ? `라운드 ${round}` : `Round ${round}`,
  analyzing: (locale: Locale) =>
    locale === "ko" ? "토론 분석 중..." : "Analyzing discussion...",
  analysisFailed: (locale: Locale) =>
    locale === "ko"
      ? "분석을 완료할 수 없습니다. 새 메시지를 보내 계속하세요."
      : "Could not complete analysis. Send a new message to continue.",
}

/* ---- Client-side verdict validation ---- */

function isValidVerdict(v: unknown): v is VerdictResult {
  if (!v || typeof v !== "object") return false
  const obj = v as Record<string, unknown>
  return (
    typeof obj.recommendedAnswer === "string" &&
    typeof obj.voteSplit === "string" &&
    typeof obj.confidence === "number" &&
    Number.isFinite(obj.confidence) &&
    Array.isArray(obj.reasons) &&
    obj.reasons.every((r: unknown) => typeof r === "string") &&
    typeof obj.minorityView === "string" &&
    typeof obj.oppositeCase === "string"
  )
}

/* ---- Helpers (exported for testing) ---- */

export function createMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createSystemMessage(content: string, locale: Locale): Message {
  return {
    id: createMessageId("system"),
    sender: "system",
    displayName: SYSTEM_DISPLAY_NAMES[locale],
    content,
    timestamp: new Date(),
  }
}

export function getApiMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.sender !== "system" && m.sender !== "verdict")
}

/** Like getApiMessages but keeps verdict messages for consensus context */
export function getConsensusMessages(messages: Message[]): Message[] {
  return messages.filter((m) => m.sender !== "system")
}

export function getAIMessageCount(messages: Message[]): number {
  return messages.filter(
    (m) => m.sender !== "user" && m.sender !== "system" && m.sender !== "verdict"
  ).length
}

/* ---- State ---- */

const DEFAULT_MODELS: Provider[] = ["gemini", "perplexity", "claude", "gpt"]

export type State = {
  messages: Message[]
  activeModels: Provider[]
  verdict: VerdictResult | null
  isDebating: boolean
  currentRound: number
  typingModel: Provider | null
  showSummary: boolean
  threadId: string | null
}

export type Action =
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "SET_TYPING"; model: Provider | null }
  | { type: "SET_DEBATING"; value: boolean }
  | { type: "SET_VERDICT"; result: VerdictResult }
  | { type: "SET_ROUND"; round: number }
  | { type: "SHOW_SUMMARY" }
  | { type: "CONTINUE_THREAD" }
  | { type: "TOGGLE_MODEL"; model: Provider }
  | { type: "SET_MODELS"; models: Provider[] }
  | { type: "SET_THREAD_ID"; id: string | null }
  | { type: "UPDATE_MESSAGE"; id: string; content: string }
  | { type: "HYDRATE_THREAD"; messages: Message[]; verdict: VerdictResult | null; showSummary: boolean }
  | { type: "RESET" }

function makeInitialState(models: Provider[]): State {
  return {
    messages: [],
    activeModels: models,
    verdict: null,
    isDebating: false,
    currentRound: 0,
    typingModel: null,
    showSummary: false,
    threadId: null,
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }
    case "UPDATE_MESSAGE": {
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, content: action.content } : m
        ),
      }
    }
    case "SET_TYPING":
      return { ...state, typingModel: action.model }
    case "SET_DEBATING":
      return { ...state, isDebating: action.value }
    case "SET_VERDICT":
      return { ...state, verdict: action.result }
    case "SET_ROUND":
      return { ...state, currentRound: action.round }
    case "SHOW_SUMMARY":
      return { ...state, showSummary: true, isDebating: false, typingModel: null }
    case "CONTINUE_THREAD":
      // Keep verdict in state (old verdicts live in messages stream).
      // Only clear showSummary so user can type, and reset round counter.
      return { ...state, showSummary: false, currentRound: 0 }
    case "TOGGLE_MODEL": {
      const has = state.activeModels.includes(action.model)
      if (has && state.activeModels.length <= 1) return state
      return {
        ...state,
        activeModels: has
          ? state.activeModels.filter((m) => m !== action.model)
          : [...state.activeModels, action.model],
      }
    }
    case "SET_MODELS":
      return { ...state, activeModels: action.models }
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
    case "RESET":
      return makeInitialState(state.activeModels)
    default:
      return state
  }
}

/* ---- Hook ---- */

export function useDebateEngine(config: {
  locale: Locale
  responseLength: ResponseLength
  maxRounds: number
}) {
  const { locale, responseLength, maxRounds } = config

  const [state, dispatch] = useReducer(reducer, makeInitialState(DEFAULT_MODELS))

  // Refs for async coordination
  const stopRef = useRef(false)
  const stoppingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef(0)
  const messagesRef = useRef<Message[]>([])
  const maxRoundsRef = useRef(maxRounds)
  const handleSendRef = useRef<
    (text: string, target: Provider | "all", models: Provider[]) => void
  >(() => {})

  // Keep refs in sync with state/config
  useEffect(() => {
    messagesRef.current = state.messages
  }, [state.messages])

  useEffect(() => {
    maxRoundsRef.current = maxRounds
  }, [maxRounds])

  /* ---- callModel ---- */

  const callModel = useCallback(
    async (
      provider: Provider,
      allMessages: Message[],
      sessionId: number
    ): Promise<Message | null> => {
      logDebate("callModel:start", { provider, sessionId, messageCount: allMessages.length })
      dispatch({ type: "SET_TYPING", model: provider })

      const placeholderId = createMessageId(provider)
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
      const updatePlaceholder = (content: string) =>
        dispatch({ type: "UPDATE_MESSAGE", id: placeholderId, content })
      const clearTypingIfCurrentSession = () => {
        if (sessionIdRef.current === sessionId) {
          dispatch({ type: "SET_TYPING", model: null })
        }
      }

      // Timeout guard - aborts after MODEL_TIMEOUT_MS
      const timeoutId = setTimeout(() => {
        if (!controller.signal.aborted) controller.abort()
      }, MODEL_TIMEOUT_MS)

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: getApiMessages(allMessages),
            provider,
            locale,
            responseLength,
          }),
          signal: controller.signal,
        })

        // Session guard - bail if a newer debate started
        if (sessionIdRef.current !== sessionId) {
          // Release the unused stream so we don't keep the upstream connection
          // open after a newer session has taken over.
          if (!controller.signal.aborted) controller.abort()
          updatePlaceholder("Response cancelled.")
          return null
        }

        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let fullContent = ""
        let finalContent: string | null = null
        let cancelled = false

        while (true) {
          if (stopRef.current || sessionIdRef.current !== sessionId) {
            cancelled = true
            await reader.cancel()
            break
          }
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            let data: Record<string, unknown>
            try {
              data = JSON.parse(trimmed.slice(5).trim())
            } catch {
              logDebate("callModel:parse-error", { provider, raw: trimmed.slice(0, 100) })
              continue
            }
            if (data.error) throw new Error(String(data.error))
            if (data.done) {
              finalContent =
                typeof data.content === "string" ? data.content : fullContent
            }
            if (data.chunk) {
              fullContent += data.chunk
              updatePlaceholder(fullContent)
            }
          }
        }

        // If loop exited due to stop/session change, don't overwrite newer state
        if (cancelled) {
          if (!fullContent) {
            updatePlaceholder("Response cancelled.")
          }
          clearTypingIfCurrentSession()
          return null
        }

        const cleaned = cleanResponse(finalContent ?? fullContent)
        logDebate("callModel:done", { provider, wordCount: cleaned.split(/\s+/).length })
        updatePlaceholder(cleaned)
        clearTypingIfCurrentSession()
        return { ...placeholder, content: cleaned }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          clearTypingIfCurrentSession()
          // Distinguish timeout from user-initiated stop
          const wasTimeout =
            sessionIdRef.current === sessionId &&
            !stopRef.current &&
            !stoppingRef.current
          const msg = wasTimeout
            ? `${DISPLAY_NAMES[provider]} timed out.`
            : "Response cancelled."
          logDebate("callModel:abort", { provider, wasTimeout })
          updatePlaceholder(msg)
          return null
        }
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        logDebate("callModel:error", { provider, error: errorMsg })
        console.error(`[debate] ${provider} failed:`, err)
        clearTypingIfCurrentSession()
        updatePlaceholder(`${DISPLAY_NAMES[provider]} encountered an error.`)
        return null
      } finally {
        clearTimeout(timeoutId)
      }
    },
    [locale, responseLength]
  )

  /* ---- runRound ---- */

  const runRound = useCallback(
    async (
      currentMessages: Message[],
      activeModels: Provider[],
      sessionId: number
    ): Promise<{ msgs: Message[]; done: boolean }> => {
      let msgs = [...currentMessages]

      for (const model of activeModels) {
        if (stopRef.current || sessionIdRef.current !== sessionId) break
        const result = await callModel(model, msgs, sessionId)
        if (result) msgs = [...msgs, result]
      }

      if (stopRef.current || sessionIdRef.current !== sessionId) {
        return { msgs, done: true }
      }

      // Mid-debate confidence check (not the final verdict)
      if (getAIMessageCount(msgs) >= 2 && activeModels.length >= 2) {
        try {
          const res = await fetch("/api/consensus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: getConsensusMessages(msgs), locale, responseLength }),
          })
          if (res.ok && sessionIdRef.current === sessionId) {
            const result = await res.json()
            if (isValidVerdict(result)) {
              dispatch({ type: "SET_VERDICT", result })
            }
          }
        } catch (err) {
          console.error("Verdict check failed:", err)
        }
      }

      return { msgs, done: false }
    },
    [callModel, locale, responseLength]
  )

  /* ---- handleSendWithModels ---- */

  const handleSendWithModels = useCallback(
    async (text: string, target: Provider | "all", models: Provider[]) => {
      // Claim a new session - any in-flight debate with old ID will bail
      const thisSession = ++sessionIdRef.current
      try {
      const orderedModels =
        target === "all" && hasDirectUrlReference(text)
          ? prioritizePerplexity(models)
          : models

      logDebate("debate:start", { session: thisSession, models: orderedModels, maxRounds: maxRoundsRef.current })

      // Abort any in-flight request from the previous session
      abortRef.current?.abort()

      // Reset all coordination refs
      stopRef.current = false
      stoppingRef.current = false
      abortRef.current = null

      const userMsg: Message = {
        id: createMessageId("user"),
        sender: "user",
        displayName: "You",
        content: text,
        timestamp: new Date(),
      }

      if (state.showSummary) {
        dispatch({ type: "CONTINUE_THREAD" })
      }
      dispatch({ type: "ADD_MESSAGE", message: userMsg })
      dispatch({ type: "SET_DEBATING", value: true })

      // Build messages from current ref (avoids stale closure)
      const allMessages = [...messagesRef.current, userMsg]

      if (target === "all") {
        let msgs = allMessages
        // Read from ref to avoid stale closure when auto-sending on mount
        const rounds = orderedModels.length >= 2 ? maxRoundsRef.current : 1
        let stoppedEarly = false

        for (let r = 0; r < rounds; r++) {
          if (stopRef.current || sessionIdRef.current !== thisSession) break
          dispatch({ type: "SET_ROUND", round: r + 1 })
          const result = await runRound(msgs, orderedModels, thisSession)
          // Post-await guards: a newer debate may have started or the user
          // may have clicked stop while runRound was in-flight. Bail before
          // pushing the next round divider or starting another iteration
          // for a round that will not actually run.
          if (sessionIdRef.current !== thisSession) break
          if (stopRef.current || stoppingRef.current) {
            stoppedEarly = true
            msgs = result.msgs
            break
          }
          msgs = result.msgs
          if (result.done) {
            stoppedEarly = true
            break
          }
          // Insert round divider between rounds (not after the last)
          if (orderedModels.length >= 2 && r < rounds - 1) {
            const roundDivider = createSystemMessage(
              SYSTEM_MESSAGES.round(locale, r + 2),
              locale
            )
            dispatch({ type: "ADD_MESSAGE", message: roundDivider })
            msgs = [...msgs, roundDivider]
          }
        }

        // Session guard
        if (sessionIdRef.current !== thisSession) return

        // Final verdict - only if not stopped and not superseded
        if (
          !stoppedEarly &&
          !stopRef.current &&
          !stoppingRef.current &&
          orderedModels.length >= 2
        ) {
          const aiCount = getAIMessageCount(msgs)
          if (aiCount >= 2) {
            const analyzingMsg = createSystemMessage(
              SYSTEM_MESSAGES.analyzing(locale),
              locale
            )
            dispatch({ type: "ADD_MESSAGE", message: analyzingMsg })
            msgs = [...msgs, analyzingMsg]

            try {
              const res = await fetch("/api/consensus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: getConsensusMessages(msgs), locale, responseLength }),
              })

              // Guard: if user stopped during fetch, let handleStop own the verdict
              if (stopRef.current || stoppingRef.current) {
                logDebate("verdict:skipped-stopped", {})
              } else if (res.ok && sessionIdRef.current === thisSession) {
                const result = await res.json()

                if (!isValidVerdict(result)) {
                  logDebate("verdict:invalid", { type: typeof result })
                  dispatch({
                    type: "UPDATE_MESSAGE",
                    id: analyzingMsg.id,
                    content: SYSTEM_MESSAGES.analysisFailed(locale),
                  })
                } else {
                  // Add verdict as inline message
                  const verdictMsg: Message = {
                    id: createMessageId("verdict"),
                    sender: "verdict",
                    displayName: "Verdict",
                    content: result.recommendedAnswer,
                    timestamp: new Date(),
                    verdictData: result,
                  }
                  dispatch({ type: "ADD_MESSAGE", message: verdictMsg })
                  dispatch({ type: "SET_VERDICT", result })
                  dispatch({ type: "SHOW_SUMMARY" })
                }
              } else if (!res.ok) {
                dispatch({
                  type: "UPDATE_MESSAGE",
                  id: analyzingMsg.id,
                  content: SYSTEM_MESSAGES.analysisFailed(locale),
                })
              }
            } catch (err) {
              console.error("Final verdict failed:", err)
              dispatch({
                type: "UPDATE_MESSAGE",
                id: analyzingMsg.id,
                content: SYSTEM_MESSAGES.analysisFailed(locale),
              })
            }
          }
        }
      } else {
        await callModel(target, allMessages, thisSession)
      }

      if (sessionIdRef.current === thisSession) {
        dispatch({ type: "SET_DEBATING", value: false })
      }
      } catch (err) {
        console.error("[debate] Unhandled debate error:", err)
        dispatch({ type: "SET_DEBATING", value: false })
        dispatch({ type: "SET_TYPING", model: null })
      }
    },
    [state.showSummary, callModel, runRound, locale, responseLength]
  )

  // Keep ref in sync for auto-send on mount
  handleSendRef.current = handleSendWithModels

  /* ---- handleSend (public, uses current activeModels) ---- */

  const handleSend = useCallback(
    (text: string, target: Provider | "all") => {
      handleSendWithModels(text, target, state.activeModels)
    },
    [handleSendWithModels, state.activeModels]
  )

  /* ---- handleStop ---- */

  const handleStop = useCallback(() => {
    // Guard against double-stop (double-click, repeated keybind)
    if (stoppingRef.current) return

    logDebate("debate:stop", { session: sessionIdRef.current })
    stoppingRef.current = true
    stopRef.current = true
    abortRef.current?.abort()
    dispatch({ type: "SET_TYPING", model: null })
    dispatch({ type: "SET_DEBATING", value: false })

    // Capture session at stop time - if a new debate starts before
    // the consensus fetch resolves, we discard the stale result.
    const stoppedSession = sessionIdRef.current

    // Fetch consensus on what we have so far
    const currentMessages = messagesRef.current
    const aiCount = getAIMessageCount(currentMessages)
    if (aiCount >= 2) {
      // Reuse existing "Analyzing..." divider if the normal flow already created one
      const existingAnalyzing = currentMessages.find(
        (m) => m.sender === "system" && m.content === SYSTEM_MESSAGES.analyzing(locale)
      )
      const analyzingMsg = existingAnalyzing ?? createSystemMessage(
        SYSTEM_MESSAGES.analyzing(locale),
        locale
      )
      if (!existingAnalyzing) {
        dispatch({ type: "ADD_MESSAGE", message: analyzingMsg })
      }

      fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: getConsensusMessages(currentMessages), locale, responseLength }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`API error: ${res.status}`)
          return res.json()
        })
        .then((result: unknown) => {
          if (sessionIdRef.current !== stoppedSession) return
          if (!isValidVerdict(result)) {
            logDebate("stop-verdict:invalid", {})
            throw new Error("Invalid verdict data")
          }
          const verdictMsg: Message = {
            id: createMessageId("verdict"),
            sender: "verdict",
            displayName: "Verdict",
            content: result.recommendedAnswer,
            timestamp: new Date(),
            verdictData: result,
          }
          dispatch({ type: "ADD_MESSAGE", message: verdictMsg })
          dispatch({ type: "SET_VERDICT", result })
          dispatch({ type: "SHOW_SUMMARY" })
        })
        .catch((err) => {
          console.error("Stop verdict failed:", err)
          dispatch({
            type: "UPDATE_MESSAGE",
            id: analyzingMsg.id,
            content: SYSTEM_MESSAGES.analysisFailed(locale),
          })
        })
    }
  }, [locale, responseLength])

  /* ---- handleReset ---- */

  const handleReset = useCallback(() => {
    stopRef.current = true
    stoppingRef.current = true
    abortRef.current?.abort()
    sessionIdRef.current++
    dispatch({ type: "RESET" })
  }, [])

  return {
    state,
    dispatch,
    handleSend,
    handleStop,
    handleReset,
    handleSendRef,
  }
}
