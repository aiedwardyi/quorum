"use client"

import { useReducer, useCallback, useRef, useEffect } from "react"
import type { Message, Provider, ConsensusResult } from "@/types"
import { cleanResponse } from "@/lib/clean-response"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import ModelSelector from "@/components/ModelSelector"
import SummaryCard from "@/components/SummaryCard"

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
  | { type: "RESET" }

const initialState: State = {
  messages: [],
  activeModels: ["gemini", "perplexity"],
  consensus: null,
  isDebating: false,
  currentRound: 0,
  typingModel: null,
  showSummary: false,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_MESSAGE":
      return { ...state, messages: [...state.messages, action.message] }
    case "UPDATE_LAST_AI_CONTENT": {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.sender !== "user") {
        msgs[msgs.length - 1] = { ...last, content: action.content }
      }
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
      return {
        ...state,
        activeModels: has
          ? state.activeModels.filter((m) => m !== action.model)
          : [...state.activeModels, action.model],
      }
    }
    case "RESET":
      return initialState
    default:
      return state
  }
}

const DISPLAY_NAMES: Record<Provider, string> = {
  gemini: "Gemini",
  perplexity: "Perplexity",
}

const MAX_ROUNDS = 5

export default function ChatPage() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stopRef = useRef(false)
  // Track active AbortController so we can cancel in-flight fetches
  const abortRef = useRef<AbortController | null>(null)

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

      // Create an AbortController so we can cancel this fetch if needed
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages, provider }),
          signal: controller.signal,
        })

        if (!res.ok) throw new Error(`API error: ${res.status}`)

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""
        let fullContent = ""

        while (true) {
          if (stopRef.current) {
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
        // Don't log abort errors -- those are intentional cancellations
        if (err instanceof DOMException && err.name === "AbortError") {
          dispatch({ type: "SET_TYPING", model: null })
          return null
        }
        console.error(`${provider} failed:`, err)
        dispatch({ type: "SET_TYPING", model: null })
        dispatch({
          type: "UPDATE_LAST_AI_CONTENT",
          content: `\u26A0\uFE0F ${provider} encountered an error and couldn't respond.`,
        })
        return null
      }
    },
    [dispatch]
  )

  const runRound = useCallback(
    async (currentMessages: Message[]): Promise<{ msgs: Message[]; done: boolean }> => {
      let msgs = [...currentMessages]

      for (const model of state.activeModels) {
        if (stopRef.current) break
        const result = await callModel(model, msgs)
        if (result) {
          msgs = [...msgs, result]
        }
      }

      if (stopRef.current) return { msgs, done: true }

      // Only check consensus if we have 2+ active models
      const aiCount = msgs.filter((m) => m.sender !== "user").length
      if (aiCount >= 2 && state.activeModels.length >= 2) {
        try {
          const res = await fetch("/api/consensus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: msgs }),
          })
          if (res.ok) {
            const result: ConsensusResult = await res.json()
            dispatch({ type: "SET_CONSENSUS", result })

            if (result.score >= 80) {
              stopRef.current = true
              dispatch({ type: "SHOW_SUMMARY" })
              return { msgs, done: true }
            }
          }
        } catch (err) {
          console.error("Consensus check failed:", err)
        }
      }

      return { msgs, done: false }
    },
    [state.activeModels, callModel]
  )

  const handleSend = useCallback(
    async (text: string, target: Provider | "all") => {
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
        // Use a local counter so rounds aren't tied to stale state
        const maxRounds = state.activeModels.length >= 2 ? MAX_ROUNDS : 1
        for (let r = 0; r < maxRounds; r++) {
          if (stopRef.current) break
          dispatch({ type: "SET_ROUND", round: r + 1 })
          const result = await runRound(msgs)
          msgs = result.msgs
          if (result.done) break
        }
      } else {
        await callModel(target, allMessages)
      }

      dispatch({ type: "SET_DEBATING", value: false })
    },
    [state.messages, state.activeModels, callModel, runRound]
  )

  const handleStop = useCallback(async () => {
    stopRef.current = true
    // Cancel any in-flight fetch
    abortRef.current?.abort()
    dispatch({ type: "SET_DEBATING", value: false })
    dispatch({ type: "SET_TYPING", model: null })

    const aiCount = state.messages.filter((m) => m.sender !== "user").length
    if (aiCount >= 2) {
      try {
        const res = await fetch("/api/consensus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: state.messages }),
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
  }, [state.messages])

  // Reset also cancels in-flight calls
  const handleReset = useCallback(() => {
    stopRef.current = true
    abortRef.current?.abort()
    dispatch({ type: "RESET" })
  }, [])

  // On mount, check if there's a prompt from the home page and auto-send it
  const initialPromptSent = useRef(false)
  useEffect(() => {
    if (initialPromptSent.current) return
    const stored = sessionStorage.getItem("quorum_initial_prompt")
    if (stored) {
      initialPromptSent.current = true
      sessionStorage.removeItem("quorum_initial_prompt")
      const timeoutId = window.setTimeout(() => {
        handleSend(stored, "all")
      }, 100)
      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [handleSend])

  const TypingIndicator = () => {
    if (!state.typingModel) return null
    const name = DISPLAY_NAMES[state.typingModel]
    return (
      <div className="px-4 py-2 text-xs text-gray-400 flex items-center gap-2">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
        {name} is thinking...
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quorum</h1>
            <p className="text-xs text-gray-500">
              Round {state.currentRound}/{MAX_ROUNDS}
            </p>
          </div>
          <ModelSelector
            activeModels={state.activeModels}
            onToggle={(m) => dispatch({ type: "TOGGLE_MODEL", model: m })}
          />
        </header>

        <ChatThread messages={state.messages} />
        <TypingIndicator />

        {state.showSummary && state.consensus && (
          <SummaryCard
            result={state.consensus}
            onNewDiscussion={handleReset}
          />
        )}

        {!state.showSummary && (
          <MessageInput
            onSend={handleSend}
            onStop={handleStop}
            disabled={state.isDebating}
            activeModels={state.activeModels}
          />
        )}
      </div>

      <aside className="hidden w-72 border-l border-gray-200 p-4 dark:border-gray-800 lg:block">
        <ConsensusMeter
          score={state.consensus?.score ?? null}
          result={state.consensus}
        />
      </aside>
    </div>
  )
}
