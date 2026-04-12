"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { Provider, ResponseLength, Locale, Theme } from "@/types"
import { cn } from "@/lib/utils"
import { Send, Check, X, Paperclip, FileText, File, Loader2 } from "lucide-react"
import { parseFile, SUPPORTED_EXTENSIONS, type ParseResult } from "@/lib/file-parser"
import { MODEL_INFO } from "@/lib/model-info"

/* ─── Model SVG Icons ─── */

const GeminiIcon = ({ size = 24, className = "", ...props }: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) => (
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

const PerplexityIcon = ({ size = 24, className = "", ...props }: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) => (
  <svg fill="currentColor" fillRule="evenodd" height={size} width={size} style={{ flex: "none", lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <title>Perplexity</title>
    <path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" />
  </svg>
)

const ClaudeIcon = ({ size = 24, className = "", ...props }: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) => (
  <svg height={size} width={size} style={{ flex: "none", lineHeight: 1 }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
    <title>Claude</title>
    <path clipRule="evenodd" d="M20.998 10.949H24v3.102h-3v3.028h-1.487V20H18v-2.921h-1.487V20H15v-2.921H9V20H7.488v-2.921H6V20H4.487v-2.921H3V14.05H0V10.95h3V5h17.998v5.949zM6 10.949h1.488V8.102H6v2.847zm10.51 0H18V8.102h-1.49v2.847z" fill="#D97757" fillRule="evenodd" />
  </svg>
)

const GPTIcon = ({ size = 24, className = "", ...props }: { size?: number; className?: string } & React.SVGProps<SVGSVGElement>) => (
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
    attach: "Attach file",
    parsing: "Reading files...",
    unsupported: "Supported: PDF, DOCX, Excel, and text files",
    truncated: (name: string) => `"${name}" is too long - only the first ~20 pages were included`,
    empty: (name: string) => `"${name}" has no readable text - it may be a scanned image`,
    too_large: (name: string) => `"${name}" exceeds the 50MB file size limit`,
    parse_error: (name: string) => `"${name}" could not be read - the file may be corrupted or password-protected`,
    tooltips: {
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
    attach: "파일 첨부",
    parsing: "파일 읽는 중...",
    unsupported: "지원 형식: PDF, DOCX, Excel, 텍스트 파일",
    truncated: (name: string) => `"${name}" 파일이 너무 길어 앞부분만 포함되었습니다`,
    empty: (name: string) => `"${name}" 파일에 읽을 수 있는 텍스트가 없습니다 - 스캔 이미지일 수 있음`,
    too_large: (name: string) => `"${name}" 파일이 50MB 크기 제한을 초과합니다`,
    parse_error: (name: string) => `"${name}" 파일을 읽을 수 없습니다 (손상되었거나 암호가 설정되어 있을 수 있음)`,
    tooltips: {
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

/* ─── Types ─── */

export interface SetupSubmitInfo {
  messageText: string
  originalPrompt: string
  hadFiles: boolean
  fileWarnings: string[]
}

interface FileState {
  id: string
  file: File
  preview?: string
  parsing?: boolean
  parseStatus?: string
  parseProgress?: number
  parsed?: ParseResult
}

interface SetupViewProps {
  locale: Locale
  theme: Theme
  selectedModels: Provider[]
  onToggleModel: (model: Provider) => void
  responseLength: ResponseLength
  onResponseLengthChange: (len: ResponseLength) => void
  rounds: number
  onRoundsChange: (rounds: number) => void
  onSubmit: (info: SetupSubmitInfo) => void
  initialPrompt?: string | null
}

/* ─── Component ─── */

export default function SetupView({
  locale,
  theme,
  selectedModels,
  onToggleModel,
  responseLength,
  onResponseLengthChange,
  rounds,
  onRoundsChange,
  onSubmit,
  initialPrompt,
}: SetupViewProps) {
  const [prompt, setPrompt] = useState(initialPrompt ?? "")
  const [isFocused, setIsFocused] = useState(false)
  const [files, setFiles] = useState<FileState[]>([])
  const filesRef = useRef(files)
  const [isDragging, setIsDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendHint = "Ctrl/\u2318+Enter"

  // Sync initialPrompt changes
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt)
  }, [initialPrompt])

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }

  // File helpers
  const addFiles = (incoming: File[]) => {
    const supported: File[] = []
    let hasUnsupported = false
    for (const file of incoming) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        supported.push(file)
      } else {
        hasUnsupported = true
      }
    }
    if (hasUnsupported) setFileError(t[locale].unsupported)
    if (supported.length === 0) return
    const newFiles = supported.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      parsing: true,
      parseProgress: 1,
    }))
    setFiles((prev) => {
      const next = [...prev, ...newFiles]
      filesRef.current = next
      return next
    })

    newFiles.forEach(async (af) => {
      const parsed = await parseFile(af.file, {
        onProgress: (status, progress) => {
          setFiles((prev) => {
            const next = prev.map((f) =>
              f.id === af.id ? { ...f, parseStatus: status, parseProgress: progress } : f
            )
            filesRef.current = next
            return next
          })
        },
      })
      if (!filesRef.current.some((f) => f.id === af.id)) return
      const warningMsg = parsed.warning === "empty" ? t[locale].empty(af.file.name)
        : parsed.warning === "too_large" ? t[locale].too_large(af.file.name)
        : parsed.warning === "parse_error" ? t[locale].parse_error(af.file.name)
        : parsed.warning === "truncated" ? t[locale].truncated(af.file.name)
        : null
      if (warningMsg) setFileError(warningMsg)
      setFiles((prev) => {
        const next = prev.map((f) =>
          f.id === af.id ? { ...f, parsing: false, parseStatus: undefined, parsed } : f
        )
        filesRef.current = next
        return next
      })
    })
  }

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      const next = prev.filter((f) => f.id !== id)
      filesRef.current = next
      return next
    })
  }

  // Auto-dismiss file error
  useEffect(() => {
    if (!fileError) return
    const timer = setTimeout(() => setFileError(null), 5000)
    return () => clearTimeout(timer)
  }, [fileError])

  const anyFileParsing = files.some((f) => f.parsing)

  const handleSubmit = () => {
    if (anyFileParsing || (!prompt.trim() && files.length === 0)) return

    let messageText = prompt.trim()

    if (files.length > 0) {
      const fileContents = files
        .filter((af) => af.parsed?.text && !af.parsed.text.startsWith("[Unsupported"))
        .map((af) => `--- File: ${af.file.name} ---\n${af.parsed!.text}`)

      if (fileContents.length === 0) return

      messageText = messageText
        ? `${messageText}\n\n${fileContents.join("\n\n")}`
        : fileContents.join("\n\n")
    }

    if (!messageText) return

    const fileWarnings = files
      .filter((af) => af.parsed?.warning)
      .map((af) => {
        const w = af.parsed!.warning!
        if (w === "truncated") return t[locale].truncated(af.file.name)
        if (w === "empty") return t[locale].empty(af.file.name)
        if (w === "too_large") return t[locale].too_large(af.file.name)
        if (w === "parse_error") return t[locale].parse_error(af.file.name)
        return null
      })
      .filter(Boolean) as string[]

    // Clean up file previews
    files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview) })

    onSubmit({
      messageText,
      originalPrompt: prompt.trim(),
      hadFiles: files.length > 0,
      fileWarnings,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <main className="relative z-10 flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 pb-24 sm:pb-32 flex flex-col justify-center">
      {/* Background blobs */}
      <div className="absolute inset-0 pointer-events-none -z-10">
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

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-col gap-8 sm:gap-12"
      >
        {/* Textarea */}
        <motion.div
          className={`relative group rounded-3xl p-[2px] overflow-hidden -mx-4 sm:-mx-6 ${isDragging ? "ring-4 ring-purple-500" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!anyFileParsing) setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (!anyFileParsing && e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files))
          }}
          initial={false}
          animate={{ scale: isFocused ? 1.02 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <div className={`absolute inset-0 bg-[conic-gradient(from_0deg,red,purple,blue,red)] animate-rotate-border ${isFocused ? "opacity-100" : "opacity-50"}`} />

          <div className="relative bg-background rounded-[22px] p-4 sm:p-6">
            <AnimatePresence>
              {fileError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-3 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-xl whitespace-pre-line"
                >
                  {fileError}
                </motion.div>
              )}
            </AnimatePresence>
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={t[locale].placeholder}
              className="w-full bg-transparent text-base min-[375px]:text-lg sm:text-xl md:text-2xl font-medium tracking-tight placeholder:text-zinc-400 dark:placeholder:text-zinc-600 resize-none outline-none min-h-[100px] sm:min-h-[120px] leading-[1.15]"
              autoFocus
            />
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {files.map((af) => {
                  const pct = Math.max(1, Math.min(100, Math.round(af.parseProgress ?? 1)))
                  return (
                    <div
                      key={af.id}
                      className={cn(
                        "group/file flex items-center gap-2.5 pl-2 pr-3 py-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl text-sm",
                        af.parsing && "pl-2"
                      )}
                    >
                      {af.parsing ? (
                        <div className="relative flex-shrink-0 w-9 h-9">
                          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-zinc-300 dark:stroke-zinc-700" />
                            <circle
                              cx="18"
                              cy="18"
                              r="15"
                              fill="none"
                              strokeWidth="3"
                              strokeLinecap="round"
                              className="stroke-blue-500 dark:stroke-blue-400 transition-[stroke-dashoffset] duration-500 ease-out"
                              strokeDasharray={2 * Math.PI * 15}
                              strokeDashoffset={2 * Math.PI * 15 * (1 - pct / 100)}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                            {pct}%
                          </span>
                        </div>
                      ) : af.file.type.includes("pdf") ? (
                        <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : (
                        <File className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className={cn("truncate max-w-[180px] leading-tight", af.parsed?.warning === "empty" || af.parsed?.warning === "too_large" || af.parsed?.warning === "parse_error" ? "text-amber-500" : "text-zinc-700 dark:text-zinc-300")}>{af.file.name}</span>
                        {af.parsing && af.parseStatus && (
                          <span className="text-[10px] text-blue-500 dark:text-blue-400 truncate max-w-[180px] leading-tight">{af.parseStatus}</span>
                        )}
                      </div>
                      <button onClick={() => removeFile(af.id)} className="text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={anyFileParsing}
                title={t[locale].attach}
                aria-label={t[locale].attach}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv"
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files))
                  e.target.value = ""
                }}
              />
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                  {sendHint}
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={anyFileParsing || (!prompt.trim() && files.length === 0)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded-lg transition-colors shadow-sm"
                >
                  {anyFileParsing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      {t[locale].start}
                    </>
                  )}
                </button>
              </div>
            </div>
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
                    onClick={() => onToggleModel(model.id)}
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
                      {MODEL_INFO[model.id].description[locale]}
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

          {/* Settings Row */}
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
                    onClick={() => { onResponseLengthChange(len); localStorage.setItem("quorum_responseLength", len) }}
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
                    onClick={() => { onRoundsChange(r.val); localStorage.setItem("quorum_rounds", String(r.val)) }}
                    className={`group/round relative cursor-pointer flex-1 px-1.5 min-[375px]:px-2 sm:px-6 py-2.5 sm:py-1.5 rounded-xl text-[11px] min-[375px]:text-xs sm:text-sm whitespace-nowrap font-medium transition-all duration-200 ${
                      rounds === r.val
                        ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                        : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 border border-transparent"
                    }`}
                  >
                    <div className="hidden sm:block absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[11px] sm:text-xs font-medium rounded-lg opacity-0 group-hover/round:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-xl">
                      {t[locale].tooltips[`rounds${r.val}` as keyof Tooltips]}
                      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-900 dark:border-t-zinc-100" />
                    </div>
                    {r.val}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </main>
  )
}
