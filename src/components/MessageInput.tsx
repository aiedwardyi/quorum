"use client"

import React, { useState, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { Provider, Locale } from "@/types"
import { Send, Square, Paperclip, X, FileText, File } from "lucide-react"
import { cn } from "@/lib/utils"

const translations = {
  en: { placeholder: "Type your message...", send: "Send", stop: "Stop", attach: "Attach file" },
  ko: { placeholder: "메시지를 입력하세요...", send: "보내기", stop: "중지", attach: "파일 첨부" },
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
}: {
  onSend: (text: string, target: Provider | "all") => void
  onStop: () => void
  disabled: boolean
  locale: Locale
}) {
  const [text, setText] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const t = translations[locale]

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [text])

  useEffect(() => {
    return () => {
      attachedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
    }
  }, [attachedFiles])

  const handleSend = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim(), "all")
      setText("")
      attachedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview) })
      setAttachedFiles([])
      if (textareaRef.current) textareaRef.current.style.height = "auto"
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const addFiles = (files: File[]) => {
    const newFiles = files.map((file) => ({
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

  return (
    <div className="w-full max-w-3xl mx-auto p-4 pb-6">
      <motion.div
        animate={{ scale: isFocused ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className="relative p-[2px] rounded-3xl overflow-hidden"
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
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (!disabled && e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files))
          }}
          onClick={() => textareaRef.current?.focus()}
          className={cn(
            "relative flex flex-col bg-white dark:bg-zinc-900 rounded-[22px] shadow-sm transition-all duration-200 z-10 cursor-text",
            isDragging ? "ring-4 ring-purple-500/20 dark:ring-purple-500/30" : ""
          )}
        >
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
            className="w-full max-h-[200px] min-h-[56px] resize-none bg-transparent px-4 py-4 text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
            rows={1}
          />

          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1">
              <input type="file" ref={fileInputRef} onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)) }} className="hidden" multiple />
              <button
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
                disabled={disabled}
                title={t.attach}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
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
                  disabled={!text.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded-lg transition-colors shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  {t.send}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
