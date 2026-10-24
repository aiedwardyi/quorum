"use client"

import React, { useState, useRef, useEffect } from "react"
import { Provider, Locale, type MessageImage } from "@/types"
import {
  Send,
  Square,
  Paperclip,
  X,
  FileText,
  File,
  ImageIcon,
  Loader2,
  Brain,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  parseFile,
  isTooLarge,
  IMAGE_EXTENSIONS,
  SUPPORTED_EXTENSIONS,
  type ParseResult,
} from "@/lib/file-parser"
import { getMissingApiKeyMessage } from "@/lib/api-key-errors"
import { shouldSendOnKey } from "@/lib/send-key"
import { pastedFiles } from "@/lib/paste-files"
import { THINK_HARD_COPY } from "@/lib/think-hard"
import { fitImages, modelImage } from "@/lib/image-parts"
import {
  capPictures,
  composeMessage,
  composerLocks,
  creepProgress,
  isImageName,
  localizeStatus,
  OCR_GRACE_MS,
  settleWithin,
  tileState,
} from "@/lib/attach-send"

const translations = {
  en: {
    placeholder: "Type your message...",
    send: "Send",
    stop: "Stop",
    attach: "Attach file",
    remove: "Remove",
    drop: "Drop files to attach",
    parsing: "Reading files...",
    unsupported: "Supported: PDF, DOCX, Excel, images (PNG, JPG, WebP), and text files",
    truncated: (name: string) => `"${name}" is too long - only the first part was included`,
    empty: (name: string) => `"${name}" has no readable text - it may be a scanned image`,
    too_large: (name: string) => `"${name}" exceeds the 50MB file size limit`,
    parse_error: (name: string) =>
      `"${name}" could not be read - the file may be corrupted or password-protected`,
    ocrDone: (name: string) => `"${name}" scanned via OCR`,
    imageNoText: (name: string) => `"${name}" has no text. The models will look at the picture.`,
    imageError: (name: string) => `"${name}" couldn't be opened`,
    imageDone: (name: string) => `"${name}" text read from image`,
    skipped: "No text, won't be sent",
    pictureLimit: "Up to 4 pictures per message.",
  },
  ko: {
    placeholder: "메시지를 입력하세요...",
    send: "보내기",
    stop: "중지",
    attach: "파일 첨부",
    remove: "삭제",
    drop: "파일을 놓아 첨부",
    parsing: "파일 읽는 중...",
    unsupported: "지원 형식: PDF, DOCX, Excel, 이미지(PNG, JPG, WebP), 텍스트 파일",
    truncated: (name: string) => `"${name}" 파일이 너무 길어 앞부분만 포함되었습니다`,
    empty: (name: string) =>
      `"${name}" 파일에 읽을 수 있는 텍스트가 없습니다 - 스캔 이미지일 수 있음`,
    too_large: (name: string) => `"${name}" 파일이 50MB 크기 제한을 초과합니다`,
    parse_error: (name: string) =>
      `"${name}" 파일을 읽을 수 없습니다 (손상되었거나 암호가 설정되어 있을 수 있음)`,
    ocrDone: (name: string) => `"${name}" OCR 스캔 완료`,
    imageNoText: (name: string) => `"${name}" 텍스트 없음 - 모델이 사진을 직접 봅니다`,
    imageError: (name: string) => `"${name}" 파일을 열 수 없습니다`,
    imageDone: (name: string) => `"${name}" 이미지 텍스트 인식 완료`,
    skipped: "텍스트 없음, 전송 안 됨",
    pictureLimit: "사진은 메시지당 4장까지 첨부할 수 있습니다.",
  },
}

interface AttachedFile {
  id: string
  file: File
  preview?: string
  parsing?: boolean
  ocrPending?: boolean
  parseStatus?: string
  parseProgress?: number
  parsed?: ParseResult
  image?: MessageImage
}

export default function MessageInput({
  onSend,
  onStop,
  disabled,
  locale,
  initialFileWarning,
  initialText,
  onApiKeyRequired,
  isAnonymous,
  sessionLoading,
  thinkHard,
  onToggleThinkHard,
}: {
  onSend: (text: string, target: Provider | "all", images?: MessageImage[]) => void
  onStop: () => void
  disabled: boolean
  locale: Locale
  initialFileWarning?: string | null
  initialText?: string | null
  onApiKeyRequired?: (provider: Provider) => void
  isAnonymous: boolean
  sessionLoading: boolean
  thinkHard: boolean
  onToggleThinkHard: () => void
}) {
  const [text, setText] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileNote, setFileNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Ref too: two fast Enters share one render, so state alone lets both through.
  const sendingRef = useRef(false)
  const ocrRef = useRef(new Map<string, Promise<ParseResult>>())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachedFilesRef = useRef<AttachedFile[]>([])
  const pasteCount = useRef(0)
  const t = translations[locale]
  const thinkHardCopy = THINK_HARD_COPY[locale]
  const sendHint = "Enter"

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
      attachedFilesRef.current.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview)
      })
    }
  }, [])

  const composerFiles = attachedFiles.map((f) => ({ ...f, name: f.file.name }))
  const anyParsing = attachedFiles.some((f) => f.parsing)
  const { attachDisabled, sendDisabled } = composerLocks(
    text,
    composerFiles,
    sessionLoading,
    sending
  )

  const handleSend = async () => {
    const message = composeMessage(text, composerFiles)
    if (sendDisabled || sendingRef.current || !message || disabled) return
    sendingRef.current = true
    setSending(true)

    const typed = text
    const sent = composerFiles
    const pictures = attachedFiles.flatMap((f) =>
      !f.parsing && f.image ? [{ file: f.file, image: f.image }] : []
    )
    setText("")
    attachedFiles.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview)
    })
    // Cleared now, not on the next render, so late OCR results find their file gone.
    attachedFilesRef.current = []
    setAttachedFiles([])
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    const [reads, images] = await Promise.all([
      settleWithin(
        sent.map((f) => (f.ocrPending ? ocrRef.current.get(f.id) : undefined)),
        OCR_GRACE_MS
      ),
      fitImages(pictures).catch(() => message.images),
    ])
    sent.forEach((f) => ocrRef.current.delete(f.id))
    const final =
      composeMessage(
        typed,
        sent.map((f, i) => (reads[i] ? { ...f, parsed: reads[i], ocrPending: false } : f))
      ) ?? message
    sendingRef.current = false
    setSending(false)
    onSend(final.text, "all", images)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })
    ) {
      e.preventDefault()
      handleSend()
    }
  }

  // Prefill text from pending prompt (e.g., after login redirect) - only once, only if empty
  const prefilled = useRef(false)
  useEffect(() => {
    if (initialText && !prefilled.current && !text) {
      prefilled.current = true
      setText(initialText) // eslint-disable-line react-hooks/set-state-in-effect
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [initialText]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show initial file warning passed from homepage
  useEffect(() => {
    if (initialFileWarning) setFileError(initialFileWarning) // eslint-disable-line react-hooks/set-state-in-effect
  }, [initialFileWarning])

  // Auto-dismiss file error
  useEffect(() => {
    if (!fileError) return
    const timer = setTimeout(() => setFileError(null), 8000)
    return () => clearTimeout(timer)
  }, [fileError])

  useEffect(() => {
    if (!fileNote) return
    const timer = setTimeout(() => setFileNote(null), 5000)
    return () => clearTimeout(timer)
  }, [fileNote])

  // OCR is one long request; creep the ring so it never looks frozen.
  useEffect(() => {
    if (!anyParsing) return
    const timer = setInterval(() => {
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.parsing ? { ...f, parseProgress: creepProgress(f.parseProgress ?? 1) } : f
        )
      )
    }, 500)
    return () => clearInterval(timer)
  }, [anyParsing])

  const addFiles = (incoming: File[]) => {
    // Auth still resolving: block attach so OCR isn't started with the wrong
    // anonymous snapshot (parseFile would call /api/ocr without the browser key).
    if (sessionLoading) return
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
    if (hasUnsupported) {
      setFileError(t.unsupported)
    }
    const { files: allowed, capped } = capPictures(
      attachedFilesRef.current.map((f) => ({ ...f, name: f.file.name })),
      supported
    )
    if (capped) setFileError(t.pictureLimit)
    if (allowed.length === 0) return
    const newFiles = allowed.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      parsing: true,
      parseProgress: 1,
    }))
    // Ahead of the render so back-to-back attaches count each other against the limit.
    attachedFilesRef.current = [...attachedFilesRef.current, ...newFiles]
    setAttachedFiles((prev) => [...prev, ...newFiles])

    // Parse each file immediately and show warnings at attach time
    newFiles.forEach(async (af) => {
      const attached = () => attachedFilesRef.current.some((f) => f.id === af.id)
      const isImage = isImageName(af.file.name)
      const pending =
        isImage && !isTooLarge(af.file) ? modelImage(af.file).catch(() => undefined) : undefined
      const parsing = parseFile(af.file, {
        isAnonymous,
        onProgress: (status, progress) => {
          if (!attached()) return
          setAttachedFiles((prev) =>
            prev.map((f) =>
              f.id === af.id
                ? {
                    ...f,
                    parseStatus: status,
                    parseProgress: Math.max(f.parseProgress ?? 1, progress ?? 1),
                  }
                : f
            )
          )
        },
        onApiKeyRequired: (provider) => {
          if (!attached()) return
          setFileError(getMissingApiKeyMessage(provider, locale))
          onApiKeyRequired?.(provider)
        },
      })
      ocrRef.current.set(af.id, parsing)
      const image = await pending
      if (image && attached()) {
        setAttachedFiles((prev) =>
          prev.map((f) => (f.id === af.id ? { ...f, parsing: false, ocrPending: true, image } : f))
        )
      }
      const parsed = await parsing
      // Bail if file was removed (or sent) while parsing
      if (!attached()) return
      const noText = parsed.warning === "empty" || parsed.warning === "parse_error"
      const warningMsg =
        image && noText
          ? null
          : parsed.warning === "empty"
            ? t.empty(af.file.name)
            : parsed.warning === "too_large"
              ? t.too_large(af.file.name)
              : parsed.warning === "parse_error"
                ? (isImage ? t.imageError : t.parse_error)(af.file.name)
                : parsed.warning === "truncated"
                  ? t.truncated(af.file.name)
                  : null
      if (warningMsg) setFileError(warningMsg)
      if (image && noText) setFileNote(t.imageNoText(af.file.name))
      else if (parsed.usedOCR && !parsed.warning)
        setFileNote((isImage ? t.imageDone : t.ocrDone)(af.file.name))
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === af.id
            ? { ...f, parsing: false, ocrPending: false, parseStatus: undefined, parsed, image }
            : f
        )
      )
    })
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = pastedFiles(
      e.clipboardData,
      (ext) => `pasted-image-${++pasteCount.current}.${ext}`
    )
    if (files.length === 0) return
    e.preventDefault()
    addFiles(files)
  }

  const removeFile = (id: string) => {
    ocrRef.current.delete(id)
    setAttachedFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((f) => f.id !== id)
    })
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pt-1 pb-3">
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
            background:
              "conic-gradient(from 0deg, #ff0000, #ff00ff, #0000ff, #00ffff, #00ff00, #ffff00, #ff0000)",
          }}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setIsDragging(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files) addFiles(Array.from(e.dataTransfer.files))
          }}
          onClick={() => textareaRef.current?.focus()}
          className="relative flex flex-col bg-white dark:bg-zinc-900 rounded-[22px] shadow-sm transition-all duration-200 z-10 cursor-text"
        >
          {isDragging && (
            <div className="absolute inset-1.5 z-20 flex items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-zinc-300 dark:border-zinc-600 bg-white/90 dark:bg-zinc-900/90 text-sm font-medium text-zinc-500 dark:text-zinc-400 pointer-events-none">
              <Paperclip className="w-4 h-4" />
              {t.drop}
            </div>
          )}

          {(fileError || fileNote) && (
            <div className="flex flex-col gap-1.5 px-3 pt-3">
              {fileError && (
                <div className="px-3 py-1.5 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/30 rounded-lg whitespace-pre-line animate-bubble-in">
                  {fileError}
                </div>
              )}
              {fileNote && (
                <div className="flex items-center gap-1.5 px-1 text-xs text-zinc-500 dark:text-zinc-400 animate-bubble-in">
                  <Check className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                  <span className="truncate">{fileNote}</span>
                </div>
              )}
            </div>
          )}

          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 border-b border-zinc-100 dark:border-zinc-800">
              {attachedFiles.map((file, index) => {
                const ext = file.file.name.split(".").pop()?.toLowerCase() ?? ""
                const Icon = IMAGE_EXTENSIONS.has(ext) ? ImageIcon : ext === "pdf" ? FileText : File
                const progress = Math.max(1, Math.min(100, Math.round(file.parseProgress ?? 1)))
                const skipped = tileState(composerFiles[index]) === "skipped"
                return (
                  <div
                    key={file.id}
                    className="group relative flex items-center gap-2.5 w-52 max-w-full p-1.5 pr-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl"
                  >
                    <div className="relative shrink-0 flex items-center justify-center w-14 h-14 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
                      {file.preview ? (
                        <img src={file.preview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon
                          className={cn(
                            "w-6 h-6",
                            ext === "pdf" ? "text-red-500" : "text-zinc-400"
                          )}
                        />
                      )}
                      {file.parsing && Icon === ImageIcon ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-zinc-900/60">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-500 dark:text-blue-400" />
                        </div>
                      ) : file.parsing ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80">
                          <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                            <circle
                              cx="18"
                              cy="18"
                              r="15"
                              fill="none"
                              strokeWidth="3"
                              className="stroke-zinc-300 dark:stroke-zinc-700"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r="15"
                              fill="none"
                              strokeWidth="3"
                              strokeLinecap="round"
                              className="stroke-blue-500 dark:stroke-blue-400 transition-[stroke-dashoffset] duration-500 ease-out"
                              strokeDasharray={2 * Math.PI * 15}
                              strokeDashoffset={2 * Math.PI * 15 * (1 - progress / 100)}
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                            {progress}%
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span
                        className={cn(
                          "text-xs font-medium truncate",
                          skipped ? "text-amber-500" : "text-zinc-700 dark:text-zinc-300"
                        )}
                      >
                        {file.file.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] truncate",
                          file.parseStatus
                            ? "text-blue-500 dark:text-blue-400"
                            : skipped
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-zinc-400 dark:text-zinc-500 uppercase"
                        )}
                      >
                        {file.parseStatus
                          ? localizeStatus(file.parseStatus, locale)
                          : skipped
                            ? t.skipped
                            : ext}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFile(file.id)
                      }}
                      aria-label={t.remove}
                      title={t.remove}
                      className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 transition-opacity max-sm:before:absolute max-sm:before:-inset-3"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="w-full max-h-[200px] min-h-[44px] resize-none bg-transparent px-4 py-3 text-[15px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
            rows={1}
          />

          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1">
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files) addFiles(Array.from(e.target.files))
                  e.target.value = ""
                }}
                className="hidden"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
                disabled={attachDisabled}
                title={t.attach}
                aria-label={t.attach}
                className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleThinkHard()
                }}
                aria-pressed={thinkHard}
                aria-label={`${thinkHardCopy.label}: ${thinkHardCopy.hint}`}
                title={thinkHardCopy.hint}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors active:scale-95",
                  thinkHard
                    ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
                    : "border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500"
                )}
              >
                <Brain className="w-3.5 h-3.5" />
                {thinkHardCopy.label}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
                {sendHint}
              </span>
              {disabled ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onStop()
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs font-medium rounded-lg transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  {t.stop}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSend()
                  }}
                  disabled={sendDisabled}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium rounded-lg transition-colors shadow-sm"
                >
                  {anyParsing || sending ? (
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
