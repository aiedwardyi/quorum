"use client"

import React, { useState, useRef, useEffect } from "react"
import { Provider, Locale } from "@/types"
import { Send, Square, Paperclip, X, FileText, File, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseFile, SUPPORTED_EXTENSIONS } from "@/lib/file-parser"

const translations = {
  en: { placeholder: "Type your message...", send: "Send", stop: "Stop", attach: "Attach file", parsing: "Reading files...", sendHint: "Ctrl+Enter", unsupported: "Supported: PDF, DOCX, Excel, and text files", truncated: (name: string) => `"${name}" is too long - only the first part was included`, empty: (name: string) => `"${name}" has no readable text - it may be a scanned image`, too_large: (name: string) => `"${name}" exceeds the 50MB file size limit`, parse_error: (name: string) => `"${name}" could not be read - the file may be corrupted or password-protected` },
  ko: { placeholder: "메시지를 입력하세요...", send: "보내기", stop: "중지", attach: "파일 첨부", parsing: "파일 읽는 중...", sendHint: "Ctrl+Enter", unsupported: "지원 형식: PDF, DOCX, Excel, 텍스트 파일", truncated: (name: string) => `"${name}" 파일이 너무 길어 앞부분만 포함되었습니다`, empty: (name: string) => `"${name}" 파일에 읽을 수 있는 텍스트가 없습니다 - 스캔 이미지일 수 있음`, too_large: (name: string) => `"${name}" 파일이 50MB 크기 제한을 초과합니다`, parse_error: (name: string) => `"${name}" 파일을 읽을 수 없습니다 (손상되었거나 암호가 설정되어 있을 수 있음)` },
}

interface AttachedFile {
  id: string
  file: File
  preview?: string
}

export default function MessageInput({
  onSend,
  onStop,
  disabled,
  locale,
  initialFileWarning,
  initialText,
}: {
  onSend: (text: string, target: Provider | "all") => void
  onStop: () => void
  disabled: boolean
  locale: Locale
  initialFileWarning?: string | null
  initialText?: string | null
}) {
  const [text, setText] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachedFilesRef = useRef<AttachedFile[]>([])
  const t = translations[locale]

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [text])

  // Track current files in ref for unmount cleanup only
  useEffect(() => {
    attachedFilesRef.current = attachedFiles
  }, [attachedFiles])

  useEffect(() => {
    return () => {
      attachedFilesRef.current.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
    }
  }, [])

  const handleSend = async () => {
    if (isParsing || (!text.trim() && attachedFiles.length === 0) || disabled) return
    setIsParsing(true)

    try {
      let messageText = text.trim()

      if (attachedFiles.length > 0) {
        const results = await Promise.allSettled(
          attachedFiles.map(async (af) => {
            const parsed = await parseFile(af.file)
            if (parsed.warning === 'empty') {
              return { content: null, warning: t.empty(af.file.name) }
            }
            if (parsed.warning === 'too_large') {
              return { content: null, warning: t.too_large(af.file.name) }
            }
            if (parsed.warning === 'parse_error') {
              return { content: null, warning: t.parse_error(af.file.name) }
            }
            const warning = parsed.warning === 'truncated' ? t.truncated(af.file.name) : null
            if (parsed.text && !parsed.text.startsWith('[Unsupported')) {
              return { content: `--- File: ${af.file.name} ---\n${parsed.text}`, warning }
            }
            return { content: null, warning }
          })
        )

        const warnings = results
          .map(r => r.status === 'fulfilled' ? r.value.warning : null)
          .filter(Boolean) as string[]
        if (warnings.length > 0) setFileError(warnings.join('\n'))

        const fileContents = results.map((r, i) => {
          if (r.status === "fulfilled" && r.value.content) return r.value.content
          if (r.status === "rejected") {
            console.error(`Failed to parse ${attachedFiles[i].file.name}:`, r.reason)
            return `--- File: ${attachedFiles[i].file.name} ---\n[Error: Could not read file]`
          }
          return null
        }).filter(Boolean) as string[]

        if (fileContents.length > 0) {
          messageText = messageText
            ? `${messageText}\n\n${fileContents.join('\n\n')}`
            : fileContents.join('\n\n')
        } else {
          // All files failed to parse - don't send bare text without the expected file content
          return
        }
      }

      if (!messageText) return

      onSend(messageText, "all")
      setText("")
      attachedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
      setAttachedFiles([])
      if (textareaRef.current) textareaRef.current.style.height = "auto"
    } finally {
      setIsParsing(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  // Prefill text from pending prompt (e.g., after login redirect) - only once, only if empty
  const prefilled = useRef(false)
  useEffect(() => {
    if (initialText && !prefilled.current && !text) {
      prefilled.current = true
      setText(initialText)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [initialText]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show initial file warning passed from homepage
  useEffect(() => {
    if (initialFileWarning) setFileError(initialFileWarning)
  }, [initialFileWarning])

  // Auto-dismiss file error
  useEffect(() => {
    if (!fileError) return
    const timer = setTimeout(() => setFileError(null), 8000)
    return () => clearTimeout(timer)
  }, [fileError])

  const addFiles = (files: File[]) => {
    const supported: File[] = []
    let hasUnsupported = false
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        supported.push(file)
      } else {
        hasUnsupported = true
      }
    }
    if (hasUnsupported) {
      setFileError(t.unsupported)
    }
    if (supported.length === 0) return
    const newFiles = supported.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }))
    setAttachedFiles((prev) => [...prev, ...newFiles])
  }

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((f) => f.id !== id)
    })
  }

  const sendDisabled = isParsing || (!text.trim() && attachedFiles.length === 0)

  return (
    <div className="w-full max-w-3xl mx-auto p-4 pb-6">
      <div
        className={`relative p-[2px] rounded-3xl overflow-hidden transition-transform duration-200 ${isFocused ? "scale-[1.02]" : "scale-100"}`}
      >
        {/* Animated rainbow border */}
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500%] aspect-square animate-rotate-border transition-opacity duration-1000 blur-3xl will-change-transform",
            isFocused ? "opacity-100" : "opacity-30"
          )}
          style={{
            background: "conic-gradient(from 0deg, #ff0000, #ff00ff, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)",
          }}
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files))
          }}
          onClick={() => textareaRef.current?.focus()}
          className={cn(
            "relative flex flex-col bg-white dark:bg-zinc-900 rounded-[22px] shadow-sm transition-all duration-200 z-10 cursor-text",
            isDragging ? "ring-4 ring-purple-500/20 dark:ring-purple-500/30" : ""
          )}
        >
          {fileError && (
            <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800/30 whitespace-pre-line animate-bubble-in">
              {fileError}
            </div>
          )}

          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border-b border-zinc-100 dark:border-zinc-800">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className="group relative flex items-center gap-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl"
                >
                  {file.preview ? (
                    <img src={file.preview} alt="" className="w-8 h-8 rounded-lg object-cover" />
                  ) : file.file.type.includes("pdf") ? (
                    <FileText className="w-4 h-4 text-red-500" />
                  ) : (
                    <File className="w-4 h-4 text-zinc-400" />
                  )}
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 max-w-[100px] truncate">
                    {file.file.name}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(file.id) }}
                    className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="w-full max-h-[200px] min-h-[56px] resize-none bg-transparent px-4 py-4 text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
            rows={1}
          />

          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1">
              <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = "" }} className="hidden" multiple accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv" />
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                disabled={isParsing}
                title={t.attach}
                aria-label={t.attach}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                {t.sendHint}
              </span>
              {disabled ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onStop() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-medium rounded-lg transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  {t.stop}
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleSend() }}
                  disabled={sendDisabled}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded-lg transition-colors shadow-sm"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t.parsing}
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      {t.send}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
