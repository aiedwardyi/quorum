"use client"

import { useReducer, useCallback, useRef, useEffect } from "react"
import type { Message, Provider, VerdictResult, Locale, ResponseLength } from "@/types"
import { cleanResponse, sanitizeHeadings } from "@/lib/clean-response"
import { hasDirectUrlReference, prioritizePerplexity } from "@/lib/url-access"
import { waitForDrain } from "@/lib/drain-registry"
import {
  getMissingApiKeyMessage,
  parseNoKeyProviderFromResponse,
} from "@/lib/api-key-errors"

/* ---- Constants ---- */

// 60s per model - keeps comfortable headroom even for medium/long
// responses. Chat Gemini now runs on 2.5 Flash (TTFT dropped back
// into Claude/GPT territory), so this cap has plenty of margin; the
// generous ceiling stays as defense-in-depth for cold-call spikes.
const MODEL_TIMEOUT_MS = 60_000

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

// Exported so ChatThread can detect the analyzing divider by content
// without hardcoding the literal strings (which silently breaks the
// moment the copy changes here).
export const SYSTEM_MESSAGES = {
  round: (locale: Locale, round: number) =>
    locale === "ko" ? `라운드 ${round}` : `Round ${round}`,
  analyzing: (locale: Locale) => (locale === "ko" ? "토론 분석 중..." : "Analyzing discussion..."),
  analysisFailed: (locale: Locale) =>
    locale === "ko"
      ? "분석을 완료할 수 없습니다. 새 메시지를 보내 계속하세요."
      : "Could not complete analysis. Send a new message to continue.",
  emptyResponse: (locale: Locale, provider: Provider) =>
    locale === "ko"
      ? `${DISPLAY_NAMES[provider]} 잠깐 간식 먹으러 갔어요. 곧 돌아올게요.`
      : `${DISPLAY_NAMES[provider]} stepped out for a snack break. Back soon.`,
  missingApiKey: (locale: Locale, provider: Provider) => getMissingApiKeyMessage(provider, locale),
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

/**
 * Resolves the final placeholder content from a streamed provider response.
 * If the provider returned no usable text - either the server flagged the
 * stream as empty, or cleanResponse left us with nothing - substitute a
 * localized fallback so the bubble doesn't get stuck in "thinking..." state.
 * cleanResponse already trims, so an empty result here means there was
 * nothing meaningful to show.
 */
export function resolveProviderContent(
  rawContent: string,
  providerEmpty: boolean,
  locale: Locale,
  provider: Provider
): string {
  const cleaned = cleanResponse(rawContent)
  if (providerEmpty || !cleaned) {
    return SYSTEM_MESSAGES.emptyResponse(locale, provider)
  }
  return cleaned
}

/* ---- State ---- */

// Gemini sits last in the default rotation. Historically this hid Pro's
// slower TTFT behind the three faster providers; chat now runs on 2.5
// Flash so that specific latency argument is weaker, but we keep the
// order because it still pays off: Gemini sees all three other models'
// opinions before forming its own, which actually improves its
// reasoning quality on consensus-style
// prompts. Users who customize the participant order override this
// default; we only rearrange the initial zero-config case.
const DEFAULT_MODELS: Provider[] = ["perplexity", "claude", "gpt", "gemini"]

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
  | {
      type: "HYDRATE_THREAD"
      messages: Message[]
      verdict: VerdictResult | null
      showSummary: boolean
    }
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
      // Minimum two models required for a debate
      if (has && state.activeModels.length <= 2) return state
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
  onApiKeyRequired?: (provider: Provider) => void
}) {
  const { locale, responseLength, maxRounds, onApiKeyRequired } = config

  const [state, dispatch] = useReducer(reducer, makeInitialState(DEFAULT_MODELS))

  // Refs for async coordination
  const stopRef = useRef(false)
  const stoppingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef(0)
  // Flipped synchronously right before the final/stop SET_VERDICT dispatch.
  // The mid-debate fire-and-forget consensus call checks this before
  // dispatching its own SET_VERDICT, so a slow mid-debate response cannot
  // overwrite the final verdict with an intermediate confidence value.
  const finalVerdictLandedRef = useRef(false)
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

        if (res.status === 402) {
          const missingProvider = (await parseNoKeyProviderFromResponse(res)) ?? provider
          onApiKeyRequired?.(missingProvider)
          updatePlaceholder(SYSTEM_MESSAGES.missingApiKey(locale, missingProvider))
          stopRef.current = true
          clearTypingIfCurrentSession()
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
        let providerEmpty = false

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
              finalContent = typeof data.content === "string" ? data.content : fullContent
              if (data.empty === true) providerEmpty = true
            }
            if (data.chunk) {
              // Sanitize on the accumulated content so chunk boundaries
              // that split `#` and `# Heading` across two chunks still
              // get caught on the combined string. Idempotent.
              fullContent = sanitizeHeadings(fullContent + data.chunk)
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

        const cleaned = resolveProviderContent(
          finalContent ?? fullContent,
          providerEmpty,
          locale,
          provider
        )
        logDebate("callModel:done", { provider, wordCount: cleaned.split(/\s+/).length })
        updatePlaceholder(cleaned)
        clearTypingIfCurrentSession()
        return { ...placeholder, content: cleaned }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          clearTypingIfCurrentSession()
          // Distinguish timeout from user-initiated stop
          const wasTimeout =
            sessionIdRef.current === sessionId && !stopRef.current && !stoppingRef.current
          const msg = wasTimeout ? `${DISPLAY_NAMES[provider]} timed out.` : "Response cancelled."
          logDebate("callModel:abort", { provider, wasTimeout })
          updatePlaceholder(msg)
          return null
        }
        // Thrown errors here cover two main cases:
        //  1. Transport errors from fetch (network dropped, CORS, etc.)
        //  2. `data.error` payloads from the chat route's error channel
        //     (upstream VertexAI / Anthropic / OpenAI failures that the
        //     server caught and forwarded with `{error}`)
        // Previously we dumped the raw error text into the bubble
        // ("Gemini encountered an error: [VertexAI.ClientError]: got
        // status: 499 Client Closed Request. {..}"), which is scary and
        // unactionable for end users. Swap in the friendly snack-break
        // fallback (the same message shown when a provider stream is
        // empty) and keep the detailed error in logDebate for debugging.
        //
        // logDebate instead of console.error so Next.js's red-box dev
        // overlay does not pop on an already-handled rejection.
        const errorMsg = err instanceof Error ? err.message : "Unknown error"
        logDebate("callModel:error", { provider, error: errorMsg })
        clearTypingIfCurrentSession()
        updatePlaceholder(SYSTEM_MESSAGES.emptyResponse(locale, provider))
        return null
      } finally {
        clearTimeout(timeoutId)
      }
    },
    [locale, responseLength, onApiKeyRequired]
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
        if (result) {
          msgs = [...msgs, result]
          // Wait for the smoothed display to finish drawing this bubble
          // before we fetch the next model. callModel resolves when the
          // network stream closes, which is typically several seconds
          // before the smoothing hook has caught up. Without this wait,
          // the next bubble would start streaming and ChatThread used to
          // force-complete the previous one, dumping 70-90% of its
          // content in a single frame. Now the next bubble waits until
          // the previous one has visibly typed through. The registry's
          // internal 8s safety timeout keeps a stuck bubble (cancelled
          // request, unmounted component) from blocking the whole debate.
          if (!stopRef.current && sessionIdRef.current === sessionId) {
            await waitForDrain(result.id)
          }
        }
      }

      if (stopRef.current || sessionIdRef.current !== sessionId) {
        return { msgs, done: true }
      }

      // Mid-debate confidence check (not the final verdict). Fire and
      // forget - the result only updates the ConsensusMeter's confidence
      // badge which can arrive whenever. Awaiting this blocked the start
      // of the next round for ~1-2 seconds per round, which felt like
      // dead time to users. The session guard inside the .then() discards
      // stale results from cancelled/superseded debates.
      if (getAIMessageCount(msgs) >= 2 && activeModels.length >= 2) {
        const consensusMsgs = getConsensusMessages(msgs)
        fetch("/api/consensus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: consensusMsgs, locale, responseLength }),
        })
          .then(async (res) => {
            if (sessionIdRef.current !== sessionId || stopRef.current) return
            if (res.status === 402) {
              const missingProvider = await parseNoKeyProviderFromResponse(res)
              if (missingProvider) onApiKeyRequired?.(missingProvider)
              return
            }
            if (!res.ok) return
            if (sessionIdRef.current !== sessionId) return
            const result = await res.json()
            if (sessionIdRef.current !== sessionId) return
            // Drop if the final (or stop) verdict has already landed -
            // otherwise a slow mid-debate response would clobber the
            // real result with an intermediate confidence value.
            if (finalVerdictLandedRef.current) return
            if (isValidVerdict(result)) {
              dispatch({ type: "SET_VERDICT", result })
            }
          })
          .catch((err) => {
            // Fire-and-forget - the mid-debate confidence update is a
            // best-effort badge, not a must-land dispatch. logDebate so
            // Next.js's dev overlay does not pop for transient failures.
            logDebate("mid-verdict:failed", {
              error: err instanceof Error ? err.message : String(err),
            })
          })
      }

      return { msgs, done: false }
    },
    [callModel, locale, responseLength, onApiKeyRequired]
  )

  /* ---- handleSendWithModels ---- */

  const handleSendWithModels = useCallback(
    async (text: string, target: Provider | "all", models: Provider[]) => {
      // Claim a new session - any in-flight debate with old ID will bail
      const thisSession = ++sessionIdRef.current
      try {
        const orderedModels =
          target === "all" && hasDirectUrlReference(text) ? prioritizePerplexity(models) : models

        logDebate("debate:start", {
          session: thisSession,
          models: orderedModels,
          maxRounds: maxRoundsRef.current,
        })

        // Abort any in-flight request from the previous session
        abortRef.current?.abort()

        // Reset all coordination refs
        stopRef.current = false
        stoppingRef.current = false
        abortRef.current = null
        finalVerdictLandedRef.current = false

        // Clear any lingering "Analyzing discussion..." dividers from a
        // prior stop-interrupted debate. If the user hit Stop mid-verdict
        // and then started a new debate, the previous analyzing divider
        // (and its skeleton card) would otherwise stay in the thread
        // animating forever underneath the new debate's content.
        for (const m of messagesRef.current) {
          if (
            m.sender === "system" &&
            (m.content === SYSTEM_MESSAGES.analyzing("en") ||
              m.content === SYSTEM_MESSAGES.analyzing("ko"))
          ) {
            dispatch({ type: "UPDATE_MESSAGE", id: m.id, content: "" })
          }
        }

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
              const roundDivider = createSystemMessage(SYSTEM_MESSAGES.round(locale, r + 2), locale)
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
              const analyzingMsg = createSystemMessage(SYSTEM_MESSAGES.analyzing(locale), locale)
              dispatch({ type: "ADD_MESSAGE", message: analyzingMsg })
              msgs = [...msgs, analyzingMsg]

              try {
                const res = await fetch("/api/consensus", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    messages: getConsensusMessages(msgs),
                    locale,
                    responseLength,
                  }),
                })

                // Guard: if user stopped during fetch, let handleStop own the verdict
                if (stopRef.current || stoppingRef.current) {
                  logDebate("verdict:skipped-stopped", {})
                } else if (res.status === 402) {
                  if (sessionIdRef.current !== thisSession) return
                  const missingProvider = (await parseNoKeyProviderFromResponse(res)) ?? "gemini"
                  onApiKeyRequired?.(missingProvider)
                  dispatch({
                    type: "UPDATE_MESSAGE",
                    id: analyzingMsg.id,
                    content: SYSTEM_MESSAGES.missingApiKey(locale, missingProvider),
                  })
                } else if (!res.ok) {
                  // Surface the server's error detail via logDebate so a
                  // dev running the app can still see *why* the verdict
                  // failed ("Verdict response is not an object", confidence
                  // out of range, timeout, etc.) but we no longer trigger
                  // Next.js's red-box dev overlay for what is already a
                  // handled rejection with a visible UI fallback.
                  try {
                    const errBody = await res.json()
                    logDebate("verdict:failed", {
                      status: res.status,
                      error: errBody?.error,
                      detail: errBody?.detail,
                    })
                  } catch {
                    logDebate("verdict:failed", { status: res.status })
                  }
                  dispatch({
                    type: "UPDATE_MESSAGE",
                    id: analyzingMsg.id,
                    content: SYSTEM_MESSAGES.analysisFailed(locale),
                  })
                } else if (sessionIdRef.current === thisSession) {
                  const result = await res.json()

                  if (!isValidVerdict(result)) {
                    logDebate("verdict:invalid", { type: typeof result })
                    dispatch({
                      type: "UPDATE_MESSAGE",
                      id: analyzingMsg.id,
                      content: SYSTEM_MESSAGES.analysisFailed(locale),
                    })
                  } else {
                    // Clear the "Analyzing discussion..." divider (and its
                    // skeleton card) now that the real verdict is ready.
                    // ChatBubble renders empty-content system messages as null.
                    dispatch({
                      type: "UPDATE_MESSAGE",
                      id: analyzingMsg.id,
                      content: "",
                    })
                    // Add verdict as inline message
                    const verdictMsg: Message = {
                      id: createMessageId("verdict"),
                      sender: "verdict",
                      displayName: "Verdict",
                      content: result.recommendedAnswer,
                      timestamp: new Date(),
                      verdictData: result,
                    }
                    // Block any late-resolving mid-debate consensus
                    // dispatch from clobbering the final result.
                    finalVerdictLandedRef.current = true
                    dispatch({ type: "ADD_MESSAGE", message: verdictMsg })
                    dispatch({ type: "SET_VERDICT", result })
                    dispatch({ type: "SHOW_SUMMARY" })
                  }
                }
              } catch (err) {
                logDebate("verdict:thrown", {
                  error: err instanceof Error ? err.message : String(err),
                })
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
        logDebate("debate:unhandled", {
          error: err instanceof Error ? err.message : String(err),
        })
        dispatch({ type: "SET_DEBATING", value: false })
        dispatch({ type: "SET_TYPING", model: null })
      }
    },
    [state.showSummary, callModel, runRound, locale, responseLength, onApiKeyRequired]
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
      const analyzingMsg =
        existingAnalyzing ?? createSystemMessage(SYSTEM_MESSAGES.analyzing(locale), locale)
      if (!existingAnalyzing) {
        dispatch({ type: "ADD_MESSAGE", message: analyzingMsg })
      }

      fetch("/api/consensus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: getConsensusMessages(currentMessages),
          locale,
          responseLength,
        }),
      })
        .then(async (res) => {
          if (res.status === 402) {
            if (sessionIdRef.current !== stoppedSession) return null
            const missingProvider = (await parseNoKeyProviderFromResponse(res)) ?? "gemini"
            onApiKeyRequired?.(missingProvider)
            dispatch({
              type: "UPDATE_MESSAGE",
              id: analyzingMsg.id,
              content: SYSTEM_MESSAGES.missingApiKey(locale, missingProvider),
            })
            return null
          }
          if (!res.ok) throw new Error(`API error: ${res.status}`)
          return res.json()
        })
        .then((result: unknown) => {
          if (result === null) return
          if (sessionIdRef.current !== stoppedSession) return
          if (!isValidVerdict(result)) {
            logDebate("stop-verdict:invalid", {})
            throw new Error("Invalid verdict data")
          }
          // Clear the analyzing divider + skeleton now that the real
          // verdict (from the Stop flow) is ready.
          dispatch({
            type: "UPDATE_MESSAGE",
            id: analyzingMsg.id,
            content: "",
          })
          const verdictMsg: Message = {
            id: createMessageId("verdict"),
            sender: "verdict",
            displayName: "Verdict",
            content: result.recommendedAnswer,
            timestamp: new Date(),
            verdictData: result,
          }
          // Same guard as the normal final-verdict path: prevents any
          // late mid-debate consensus response from clobbering the stop
          // verdict with an intermediate confidence.
          finalVerdictLandedRef.current = true
          dispatch({ type: "ADD_MESSAGE", message: verdictMsg })
          dispatch({ type: "SET_VERDICT", result })
          dispatch({ type: "SHOW_SUMMARY" })
        })
        .catch((err) => {
          // logDebate (dev-only console.log) instead of console.error so
          // Next.js's red-box dev overlay does NOT trigger. This path is
          // an expected failure mode when the user hits Stop right as
          // the debate is finishing: handleStop fires its own consensus
          // fetch, and if the backend races with the in-flight fetch from
          // the normal flow (or just 500s under load), we gracefully fall
          // back to the analysisFailed divider. The UI fallback is
          // already shown below - no need to scare the user in dev mode
          // with a full-screen error overlay for a handled rejection.
          logDebate("stop-verdict:failed", {
            error: err instanceof Error ? err.message : String(err),
          })
          dispatch({
            type: "UPDATE_MESSAGE",
            id: analyzingMsg.id,
            content: SYSTEM_MESSAGES.analysisFailed(locale),
          })
        })
    }
  }, [locale, responseLength, onApiKeyRequired])

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
