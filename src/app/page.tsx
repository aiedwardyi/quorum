"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight } from "lucide-react"

export default function Home() {
  const router = useRouter()
  const [prompt, setPrompt] = useState("")
  const [mounted, setMounted] = useState(false)

  // Fade-in on mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleStart = useCallback(() => {
    const trimmed = prompt.trim()
    if (!trimmed) return
    // Store the prompt so /chat can pick it up
    sessionStorage.setItem("quorum_initial_prompt", trimmed)
    router.push("/chat")
  }, [prompt, router])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to submit
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleStart()
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fafaf9]">
      {/* Subtle background gradient orbs */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full opacity-[0.07]"
        style={{
          background:
            "radial-gradient(ellipse at center, #3B82F6 0%, #14B8A6 40%, transparent 70%)",
        }}
      />

      {/* Main content */}
      <main
        className={`relative z-10 flex w-full max-w-2xl flex-col items-center px-6 transition-all duration-700 ease-out ${
          mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        {/* Brand */}
        <div className="mb-12 flex flex-col items-center gap-3">
          <h1
            className="text-[2.75rem] font-[275] tracking-[-0.04em] text-neutral-900"
            style={{ fontFamily: "'Geist', sans-serif" }}
          >
            Quorum
          </h1>
          <p className="text-[0.9rem] font-light tracking-wide text-neutral-400">
            Multi-AI consensus — one conversation
          </p>
        </div>

        {/* Prompt input area */}
        <div className="group w-full">
          <div
            className="relative rounded-2xl border border-neutral-200/80 bg-white shadow-sm
                        transition-all duration-300
                        focus-within:border-neutral-300 focus-within:shadow-md"
          >
            <label htmlFor="prompt-input" className="sr-only">
              What do you need consensus on?
            </label>
            <textarea
              id="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you need consensus on?"
              rows={4}
              className="w-full resize-none rounded-2xl bg-transparent px-5 pb-14 pt-5
                         text-[0.95rem] leading-relaxed text-neutral-800
                         placeholder:text-neutral-300
                         focus:outline-none"
              autoFocus
            />

            {/* Bottom bar inside the textarea card */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pb-3">
              <span className="text-[0.7rem] text-neutral-300">
                {prompt.trim() ? "\u2318 Enter to start" : ""}
              </span>

              <button
                onClick={handleStart}
                disabled={!prompt.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2
                           text-[0.8rem] font-medium text-white
                           transition-all duration-200
                           hover:bg-neutral-800
                           disabled:cursor-not-allowed disabled:opacity-30"
              >
                Start Discussion
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Subtle model badges */}
        <div
          className={`mt-8 flex items-center gap-4 transition-all delay-200 duration-700 ease-out ${
            mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]" />
            <span className="text-[0.7rem] font-medium tracking-wide text-neutral-400">
              Gemini
            </span>
          </div>
          <div className="h-3 w-px bg-neutral-200" />
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-[#14B8A6]" />
            <span className="text-[0.7rem] font-medium tracking-wide text-neutral-400">
              Perplexity
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
