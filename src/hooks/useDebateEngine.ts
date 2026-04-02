"use client"

import { useReducer, useCallback, useRef, useEffect } from "react"
import type { Message, Provider, VerdictResult, Locale, ResponseLength } from "@/types"
import { cleanResponse } from "@/lib/clean-response"

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

export function getAIMessageCount(messages: Message[]): number {
  return messages.filter(
    (m) => m.sender !== "user" && m.sender !== "system" && m.sender !== "verdict"
  ).length
}

/* ---- State ---- */

const DEFAULT_MODELS: Provider[] = ["gemini", "perplexity"]

export type State = {
  messages: Message[]
  activeModels: Provider[]
  verdict: VerdictResult | null
  isDebating: boolean
  currentRound: number
  typingModel: Provider | null
  showSummary: boolean
}

export type Action =
  | { type: "ADD_MESSAGE"; message: Message }
  | { type: "UPDATE_LAST_AI_CONTENT"; content: string }
  | { type: "SET_TYPING"; model: Provider | null }
  | { type: "SET_DEBATING"; value: boolean }
  | { type: "SET_VERDICT"; result: VerdictResult }
  | { type: "SET_ROUND"; round: number }
  | { type: "SHOW_SUMMARY" }
  | { type: "CONTINUE_THREAD" }
  | { type: "TOGGLE_MODEL"; model: Provider }
  | { type: "SET_MODELS"; models: Provider[] }
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
  }
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }
    case "UPDATE_LAST_AI_CONTENT": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.sender !== "user" && last.sender !== "system" && last.sender !== "verdict") {
        msgs[msgs.length - 1] = { ...last, content: action.content }
      }
      return { ...state, messages: msgs }
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
        if (sessionIdRef.current !== sessionId) return null

        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let fullContent = ""
        let finalContent: string | null = null

        while (true) {
          if (stopRef.current || sessionIdRef.current !== sessionId) {
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
              dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: fullContent })
            }
          }
        }

        const cleaned = cleanResponse(finalContent ?? fullContent)
        logDebate("callModel:done", { provider, wordCount: cleaned.split(/\s+/).length })
        dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: cleaned })
        dispatch({ type: "SET_TYPING", model: null })
        return { ...placeholder, content: cleaned }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          dispatch({ type: "SET_TYPING", model: null })
          // Distinguish timeout from user-initiated stop
          const wasTimeout = !stopRef.current && !stoppingRef.current
          const msg = wasTimeout
            ? `${DISPLAY_NAMES[provider]} timed out.`
            : "Response cancelled."
          logDebate("callModel:abort", { provider, wasTimeout })
          dispatch({ type: "UPDATE_LAST_AI_CONTENT", content: msg })
          return null
        }
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        logDebate("callModel:error", { provider, error: errorMsg })
        console.error(`[debate] ${provider} failed:`, err)
        dispatch({ type: "SET_TYPING", model: null })
        dispatch({
          type: "UPDATE_LAST_AI_CONTENT",
          content: `${DISPLAY_NAMES[provider]} encountered an error.`,
        })
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
            body: JSON.stringify({ messages: getApiMessages(msgs), locale }),
          })
          if (res.ok && sessionIdRef.current === sessionId) {
            const result: VerdictResult = await res.json()
            dispatch({ type: "SET_VERDICT", result })
          }
        } catch (err) {
          console.error("Verdict check failed:", err)
        }
      }

      return { msgs, done: false }
    },
    [callModel, locale]
  )

  /* ---- handleSendWithModels ---- */

  const handleSendWithModels = useCallback(
    async (text: string, target: Provider | "all", models: Provider[]) => {
      // Claim a new session - any in-flight debate with old ID will bail
      const thisSession = ++sessionIdRef.current
      logDebate("debate:start", { session: thisSession, models, maxRounds: maxRoundsRef.current })

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
        const rounds = models.length >= 2 ? maxRoundsRef.current : 1
        let stoppedEarly = false

        for (let r = 0; r < rounds; r++) {
          if (stopRef.current || sessionIdRef.current !== thisSession) break
          dispatch({ type: "SET_ROUND", round: r + 1 })
          const result = await runRound(msgs, models, thisSession)
          msgs = result.msgs
          if (result.done) {
            stoppedEarly = true
            break
          }
          // Insert round divider between rounds (not after the last)
          if (models.length >= 2 && r < rounds - 1) {
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
          models.length >= 2
        ) {
          const aiCount = getAIMessageCount(msgs)
          if (aiCount >= 2) {
            try {
              const analyzingMsg = createSystemMessage(
                SYSTEM_MESSAGES.analyzing(locale),
                locale
              )
              dispatch({ type: "ADD_MESSAGE", message: analyzingMsg })
              msgs = [...msgs, analyzingMsg]

              const res = await fetch("/api/consensus", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ messages: getApiMessages(msgs), locale }),
              })

              if (res.ok && sessionIdRef.current === thisSession) {
                const result: VerdictResult = await res.json()

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
            } catch (err) {
              console.error("Final verdict failed:", err)
            }
          }
        }
      } else {
        await callModel(target, allMessages, thisSession)
      }

      if (sessionIdRef.current === thisSession) {
        dispatch({ type: "SET_DEBATING", value: false })
      }
    },
    [state.showSummary, maxRounds, callModel, runRound, locale]
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
      const analyzingMsg = createSystemMessage(
        SYSTEM_MESSAGES.analyzing(locale),
        locale
      )
      dispatch({ type: "ADD_MESSAGE", message: analyzingMsg })

      fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: getApiMessages(currentMessages), locale }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((result: VerdictResult | null) => {
          if (result && sessionIdRef.current === stoppedSession) {
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
        })
        .catch((err) => console.error("Stop verdict failed:", err))
    }
  }, [locale])

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
