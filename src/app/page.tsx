"use client"

import React, { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Sun, Moon, Star, Heart, Flame, Cat, Snowflake, Send, Check, User, Settings2, LogOut, LogIn, X, Sparkles, Paperclip } from "lucide-react"
import SettingsModal from "@/components/SettingsModal"
import { motion, AnimatePresence } from "framer-motion"
import { THEMES } from "@/types"
import type { Provider, ResponseLength, Locale, Theme } from "@/types"
import { cn } from "@/lib/utils"
import { useSession, signIn, signOut } from "next-auth/react"
import { shouldShowLoginGate, savePendingDebate } from "@/components/LoginGate"
import LoginGateModal from "@/components/LoginGate"

/* ─── Model SVG Icons ─── */

const GeminiIcon = ({ size = 24, className = "", ...props }: any) => (
  <svg height={size} width={size} style={{ flex: "none", lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <title>Gemini</title>
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF" />
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gemini-g0)" />
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gemini-g1)" />
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#gemini-g2)" />
    <defs>
      <linearGradient gradientUnits="userSpaceOnUse" id="gemini-g0" x1="7" x2="11" y1="15.5" y2="12"><stop stopColor="#08B962" /><stop offset="1" stopColor="#08B962" stopOpacity="0" /></linearGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id="gemini-g1" x1="8" x2="11.5" y1="5.5" y2="11"><stop stopColor="#F94543" /><stop offset="1" stopColor="#F94543" stopOpacity="0" /></linearGradient>
      <linearGradient gradientUnits="userSpaceOnUse" id="gemini-g2" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stopColor="#FABC12" /><stop offset=".46" stopColor="#FABC12" stopOpacity="0" /></linearGradient>
    </defs>
  </svg>
)

const PerplexityIcon = ({ size = 24, className = "", ...props }: any) => (
  <svg fill="currentColor" fillRule="evenodd" height={size} width={size} style={{ flex: "none", lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <title>Perplexity</title>
    <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" />
  </svg>
)

const ClaudeIcon = ({ size = 24, className = "", ...props }: any) => (
  <svg height={size} width={size} style={{ flex: "none", lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <title>Claude</title>
    <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
  </svg>
)

const GPTIcon = ({ size = 24, className = "", ...props }: any) => (
  <svg fill="currentColor" fillRule="evenodd" height={size} width={size} style={{ flex: "none", lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <title>OpenAI</title>
    <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
  </svg>
)

/* ─── Model config ─── */

const MODELS: { id: Provider; color: string; icon: React.ElementType }[] = [
  { id: "gemini", color: "#3B82F6", icon: GeminiIcon },
  { id: "perplexity", color: "#14B8A6", icon: PerplexityIcon },
  { id: "claude", color: "#F97316", icon: ClaudeIcon },
  { id: "gpt", color: "#10B981", icon: GPTIcon },
]

/* ─── Translations ─── */

type Tooltips = typeof t["en"]["tooltips"]

const t = {
  en: {
    placeholder: "What should the AIs debate?",
    start: "Send",
    short: "Short",
    medium: "Medium",
    long: "Long",
    rounds: "rounds",
    singleRound: "single",
    quickTake: "quick",
    standard: "standard",
    deepDive: "deep",
    responseLength: "Response Length",
    roundsCount: "Rounds",
    models: "Participants",
    keyboardHint: "to submit",
    settings: "Settings",
    signOut: "Sign Out",
    tooltips: {
      gemini: "Google's flagship multimodal AI model",
      perplexity: "AI search engine for up-to-date information",
      claude: "Anthropic's advanced reasoning model",
      gpt: "OpenAI's powerful language model",
      short: "1-2 paragraphs per response",
      medium: "3-4 paragraphs per response",
      long: "Comprehensive, detailed analysis",
      rounds1: "Single response from each model",
      rounds2: "Quick back-and-forth",
      rounds3: "Standard debate",
      rounds5: "Deep analysis",
    },
  },
  ko: {
    placeholder: "AI들이 무엇을 토론할까요?",
    start: "전송",
    short: "짧게",
    medium: "보통",
    long: "길게",
    rounds: "라운드",
    singleRound: "단일",
    quickTake: "빠른",
    standard: "기본",
    deepDive: "심층",
    responseLength: "응답 길이",
    roundsCount: "라운드 수",
    models: "참여 모델",
    keyboardHint: "눌러서 시작",
    settings: "설정",
    signOut: "로그아웃",
    tooltips: {
      gemini: "Google의 최신 멀티모달 AI 모델",
      perplexity: "최신 정보를 제공하는 AI 검색 엔진",
      claude: "Anthropic의 고급 추론 모델",
      gpt: "OpenAI의 강력한 언어 모델",
      short: "응답당 1-2 문단",
      medium: "응답당 3-4 문단",
      long: "포괄적이고 상세한 분석",
      rounds1: "각 모델의 단일 응답",
      rounds2: "빠른 의견 교환",
      rounds3: "표준 토론",
      rounds5: "심층 분석",
    },
  },
}

/* ─── Display name helper ─── */

function modelDisplayName(id: Provider): string {
  if (id === "gpt") return "GPT"
  return id.charAt(0).toUpperCase() + id.slice(1)
}

/* ─── Component ─── */

export default function Home() {
  const router = useRouter()
  const [theme, setTheme] = useState<Theme>("dark")
  const [locale, setLocale] = useState<Locale>("en")
  const [prompt, setPrompt] = useState("")
  const [selectedModels, setSelectedModels] = useState<Provider[]>(["gemini", "perplexity", "claude", "gpt"])
  const [responseLength, setResponseLength] = useState<ResponseLength>("medium")
  const [rounds, setRounds] = useState<number>(3)
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auth & login gate
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user
  const [showGate, setShowGate] = useState(false)

  // Header & Settings state
  const [showDropdown, setShowDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-header-dropdown]")) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const applyThemeToDOM = (t: Theme) => {
    const cl = document.documentElement.classList
    cl.remove(...THEMES.filter((t) => t !== "light"))
    if (t !== "light") {
      cl.add("dark")
      if (t !== "dark") cl.add(t)
    }
  }

  useEffect(() => {
    const applyTheme = () => {
      const saved = localStorage.getItem("quorum_theme") as Theme | null
      const valid = THEMES
      if (saved && valid.includes(saved)) {
        setTheme(saved)
        applyThemeToDOM(saved)
      } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setTheme("dark")
        applyThemeToDOM("dark")
      } else {
        setTheme("light")
        applyThemeToDOM("light")
      }
    }
    applyTheme()

    // BUG-015: Re-apply theme when page becomes visible again
    // (handles both bfcache restore and Next.js client-side back/forward)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") applyTheme()
    }
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) applyTheme()
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

  const changeTheme = (t: Theme) => {
    setTheme(t)
    localStorage.setItem("quorum_theme", t)
    applyThemeToDOM(t)
  }

  const toggleTheme = () => {
    const order = THEMES
    const next = order[(order.indexOf(theme) + 1) % order.length]
    changeTheme(next)
  }

  const toggleModel = (model: Provider) => {
    if (selectedModels.includes(model)) {
      if (selectedModels.length > 2) {
        setSelectedModels(selectedModels.filter((m) => m !== model))
      }
    } else {
      if (selectedModels.length < 4) {
        setSelectedModels([...selectedModels, model])
      }
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  const handleSubmit = () => {
    if (!prompt.trim()) return
    if (shouldShowLoginGate(!!session?.user)) {
      savePendingDebate({
        prompt: prompt.trim(),
        models: selectedModels,
        responseLength,
        rounds,
        locale,
      })
      setShowGate(true)
      return
    }
    const config = {
      prompt: prompt.trim(),
      models: selectedModels,
      responseLength,
      rounds,
      locale,
    }
    sessionStorage.setItem("quorum_config", JSON.stringify(config))
    router.push("/chat")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)])
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground font-[family-name:var(--font-geist-sans)] selection:bg-zinc-200 dark:selection:bg-zinc-800 transition-colors duration-300 flex flex-col">
      {/* Background animation */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-blue-400/10 dark:bg-blue-500/5 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -50, 0], y: [0, 30, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-teal-400/10 dark:bg-teal-500/5 blur-[120px]"
        />
      </div>

      {/* Header */}
      <header className="relative z-30 flex justify-between items-center p-4 sm:p-6 md:p-8 w-full max-w-5xl mx-auto">
        <div className="font-semibold tracking-tight text-base sm:text-lg flex items-center gap-2">
          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-sm bg-zinc-900 dark:bg-zinc-100" />
          Quorum
        </div>
        <div className="flex items-center gap-3 sm:gap-5">
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => setLocale(locale === "en" ? "ko" : "en")}
            className={cn("cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors rounded-md px-1", theme === "lovelace" && "hover:ring-2 hover:ring-[#c574dd]/60", theme === "tokyonight" && "hover:ring-2 hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-2 hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-2 hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-2 hover:ring-[#88c0d0]/50")}
          >
            {locale === "en" ? "EN" : "KO"}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            whileHover={{ scale: 1.05 }}
            onClick={toggleTheme}
            className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all group", theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#c574dd]/60", theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50")}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait">
              {theme === "light" && (
                <motion.div key="sun" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, 360], transition: { duration: 3, repeat: Infinity, ease: "linear" } }}>
                  <Sun className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "dark" && (
                <motion.div key="moon" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, -15, 15, -15, 0], transition: { duration: 0.5, repeat: Infinity, ease: "easeInOut" } }}>
                  <Moon className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "tokyonight" && (
                <motion.div key="star" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.2 }}
                  whileHover={{ scale: [1, 1.3, 1], transition: { duration: 1, repeat: Infinity, ease: "easeInOut" } }}>
                  <Star className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "lovelace" && (
                <motion.div key="heart" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.2 }}
                  whileHover={{ scale: [1, 1.2, 1, 1.15, 1], transition: { duration: 0.8, repeat: Infinity, ease: "easeInOut" } }}>
                  <Heart className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "gruvbox" && (
                <motion.div key="flame" initial={{ scale: 0, y: 5 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0, y: 5 }} transition={{ duration: 0.2 }}
                  whileHover={{ y: [0, -2, 0, -1, 0], scale: [1, 1.15, 1, 1.1, 1], transition: { duration: 0.6, repeat: Infinity, ease: "easeInOut" } }}>
                  <Flame className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "catppuccin" && (
                <motion.div key="cat" initial={{ scale: 0, rotate: 15 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: -15 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, -10, 10, -5, 0], y: [0, -1, 0], transition: { duration: 0.7, repeat: Infinity, ease: "easeInOut" } }}>
                  <Cat className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
              {theme === "nord" && (
                <motion.div key="snowflake" initial={{ scale: 0, rotate: 60 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: -60 }} transition={{ duration: 0.2 }}
                  whileHover={{ rotate: [0, 180, 360], scale: [1, 1.15, 1], transition: { duration: 2, repeat: Infinity, ease: "linear" } }}>
                  <Snowflake className="w-3.5 h-3.5 text-zinc-600 dark:text-zinc-400" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>

          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1" />

          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <motion.div
                whileHover={{ scale: 1.05 }}
                className={cn("flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all cursor-default group", theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#c574dd]/60", theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50")}
              >
                <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] sm:text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100">1,250</span>
              </motion.div>

              <div className="relative" data-header-dropdown>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm", theme === "lovelace" && "hover:ring-[1.5px] hover:ring-[#c574dd]/60", theme === "tokyonight" && "hover:ring-[1.5px] hover:ring-[#7aa2f7]/40", theme === "gruvbox" && "hover:ring-[1.5px] hover:ring-[#fe8019]/50", theme === "catppuccin" && "hover:ring-[1.5px] hover:ring-[#cba6f7]/50", theme === "nord" && "hover:ring-[1.5px] hover:ring-[#88c0d0]/50")}
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
                          onClick={() => { setShowDropdown(false); setShowSettings(true) }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                        >
                          <Settings2 className="w-4 h-4" />
                          {t[locale].settings}
                        </button>
                        <div className="h-px bg-border my-1" />
                        <button
                          onClick={() => { setShowDropdown(false); signOut() }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <LogOut className="w-4 h-4" />
                          {t[locale].signOut}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => signIn("google")}
              className="flex items-center justify-center gap-2 h-7 w-7 sm:h-8 sm:w-auto sm:px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-full border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs font-bold">Sign In</span>
            </motion.button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-24 sm:pb-32 flex flex-col justify-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
          className="flex flex-col gap-8 sm:gap-12"
        >
          {/* Textarea */}
          <motion.div
            className={`relative group rounded-3xl p-[2px] overflow-hidden -mx-4 sm:-mx-6 ${isDragging ? "ring-4 ring-purple-500" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            initial={false}
            animate={{ scale: isFocused ? 1.02 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <div className={`absolute inset-0 bg-[conic-gradient(from_0deg,red,purple,blue,red)] animate-rotate-border ${isFocused ? "opacity-100" : "opacity-50"}`} />

            <div className="relative bg-background rounded-[22px] p-4 sm:p-6">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={t[locale].placeholder}
                className="w-full bg-transparent text-lg min-[375px]:text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium tracking-tight placeholder:text-zinc-400 dark:placeholder:text-zinc-600 resize-none outline-none min-h-[100px] sm:min-h-[120px] leading-[1.15]"
                autoFocus
              />
              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
                >
                  <Paperclip size={20} />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
                    }
                  }}
                />
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-zinc-200 dark:bg-zinc-800 px-3 py-1 rounded-full text-sm">
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <button onClick={() => setFiles(files.filter((_, i) => i !== index))} className="hover:text-red-500">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Controls */}
          <div className="flex flex-col gap-8 sm:gap-10">
            {/* Models */}
            <div className="flex flex-col gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {t[locale].models}
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                {MODELS.map((model) => {
                  const isSelected = selectedModels.includes(model.id)
                  const isDisabled = !isSelected && selectedModels.length >= 4
                  const isMinReached = isSelected && selectedModels.length <= 2
                  const Icon = model.icon

                  return (
                    <motion.button
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      disabled={isDisabled && !isSelected}
                      initial={false}
                      animate={{
                        scale: isSelected ? 1.02 : 1,
                        opacity: isDisabled && !isSelected ? 0.3 : isSelected ? 1 : 0.6,
                      }}
                      whileHover={
                        isDisabled && !isSelected
                          ? {}
                          : { scale: isSelected ? 1.04 : 1.02, opacity: 1 }
                      }
                      whileTap={{
                        scale: (isDisabled && !isSelected) || isMinReached ? (isSelected ? 1.02 : 1) : 0.98,
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className={`group/model relative flex flex-col items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl transition-all duration-300 text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-600 border ${
                        isSelected
                          ? "bg-white dark:bg-zinc-900"
                          : "bg-zinc-50/50 dark:bg-zinc-900/20 border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-900/50"
                      } ${(isDisabled && !isSelected) || isMinReached ? "cursor-not-allowed" : "cursor-pointer"}`}
                      style={
                        isSelected
                          ? {
                              borderColor: `${model.color}80`,
                              boxShadow: `0 4px 24px -6px ${model.color}40`,
                            }
                          : {}
                      }
                    >
                      {/* Tooltip */}
                      <div className="hidden sm:block absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] sm:text-xs font-medium rounded-lg opacity-0 group-hover/model:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                        {t[locale].tooltips[model.id as keyof Tooltips]}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100" />
                      </div>

                      <div className="flex justify-between w-full items-start">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300"
                          style={{
                            backgroundColor: isSelected ? `${model.color}15` : "transparent",
                            color: isSelected ? model.color : "currentColor",
                          }}
                        >
                          <Icon size={16} className={isSelected ? "" : "text-zinc-500 dark:text-zinc-400"} />
                        </div>
                        <div
                          className={`w-4 h-4 mt-1 rounded-full border flex items-center justify-center transition-all duration-300 ${
                            isSelected
                              ? "bg-zinc-900 dark:bg-zinc-100 border-transparent text-white dark:text-zinc-900 scale-100"
                              : "border-zinc-300 dark:border-zinc-600 text-transparent scale-90"
                          }`}
                        >
                          <Check size={10} strokeWidth={3} />
                        </div>
                      </div>
                      <span
                        className={`font-medium text-xs sm:text-sm tracking-wide transition-colors ${
                          isSelected ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {modelDisplayName(model.id)}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            <div className="h-px w-full bg-zinc-200/60 dark:bg-zinc-800/60" />

            {/* Settings and Submit Row */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-8">
              <div className="flex flex-col sm:flex-row gap-6 sm:gap-12 lg:gap-16">
                {/* Response Length */}
                <div className="flex flex-col gap-4 w-full sm:w-auto">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    {t[locale].responseLength}
                  </span>
                  <div className="flex items-center w-full sm:w-auto gap-1 bg-zinc-100/50 dark:bg-zinc-900/30 p-1 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                    {(["short", "medium", "long"] as ResponseLength[]).map((len) => (
                      <motion.button
                        key={len}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setResponseLength(len)}
                        className={`group/len relative cursor-pointer flex-1 px-1.5 min-[375px]:px-2 sm:px-4 py-2.5 sm:py-1.5 rounded-xl text-[11px] min-[375px]:text-xs sm:text-sm whitespace-nowrap font-medium transition-all duration-200 ${
                          responseLength === len
                            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent"
                        }`}
                      >
                        <div className="hidden sm:block absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] sm:text-xs font-medium rounded-lg opacity-0 group-hover/len:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                          {t[locale].tooltips[len]}
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100" />
                        </div>
                        {t[locale][len]}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Rounds */}
                <div className="flex flex-col gap-4 w-full sm:w-auto">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    {t[locale].roundsCount}
                  </span>
                  <div className="flex items-center w-full sm:w-auto gap-1 bg-zinc-100/50 dark:bg-zinc-900/30 p-1 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                    {[
                      { val: 1, label: `1 ${t[locale].rounds}`, desc: t[locale].singleRound },
                      { val: 2, label: `2 ${t[locale].rounds}`, desc: t[locale].quickTake },
                      { val: 3, label: `3 ${t[locale].rounds}`, desc: t[locale].standard },
                      { val: 5, label: `5 ${t[locale].rounds}`, desc: t[locale].deepDive },
                    ].map((r) => (
                      <motion.button
                        key={r.val}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setRounds(r.val)}
                        className={`group/round relative cursor-pointer flex-1 px-1.5 min-[375px]:px-2 sm:px-4 py-2.5 sm:py-1.5 rounded-xl text-[11px] min-[375px]:text-xs sm:text-sm whitespace-nowrap font-medium transition-all duration-200 ${
                          rounds === r.val
                            ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                            : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent"
                        }`}
                      >
                        <div className="hidden sm:block absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] sm:text-xs font-medium rounded-lg opacity-0 group-hover/round:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                          {t[locale].tooltips[`rounds${r.val}` as keyof Tooltips]}
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100" />
                        </div>
                        {r.val} {t[locale].rounds}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!prompt.trim()}
                className="cursor-pointer w-full lg:w-auto group relative flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-4 sm:py-3.5 rounded-2xl text-sm font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10 mt-2 lg:mt-0"
              >
                <Send size={16} className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                {t[locale].start}
              </button>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        locale={locale}
        onToggleLocale={() => setLocale((l) => (l === "en" ? "ko" : "en"))}
        activeModels={selectedModels}
        onToggleModel={toggleModel}
        maxRounds={rounds}
        onChangeRounds={setRounds}
        showPreferences={false}
      />
      {showGate && <LoginGateModal onClose={() => setShowGate(false)} locale={locale} />}
    </div>
  )
}

