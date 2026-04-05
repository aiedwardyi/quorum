"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Trash2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import type { ThreadSummary, Locale } from "@/types"

const t = {
  en: {
    search: "Search threads...",
    newDebate: "New Debate",
    noThreads: "No past debates",
    deleteConfirm: "Delete this thread?",
    active: "Active",
  },
  ko: {
    search: "토론 검색...",
    newDebate: "새 토론",
    noThreads: "이전 토론이 없습니다",
    deleteConfirm: "이 토론을 삭제하시겠습니까?",
    active: "진행 중",
  },
}

function timeAgo(date: string, locale: Locale): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return locale === "ko" ? "방금" : "just now"
  if (minutes < 60) return locale === "ko" ? `${minutes}분 전` : `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return locale === "ko" ? `${days}일 전` : `${days}d ago`
  return new Date(date).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
  })
}

export default function ThreadDropdown({
  currentThreadId,
  currentTitle,
  locale,
  onNewDebate,
}: {
  currentThreadId: string | null
  currentTitle: string | null
  locale: Locale
  onNewDebate: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const labels = t[locale]

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen])

  // Fetch threads when dropdown opens
  const fetchThreads = useCallback(async (query?: string) => {
    setLoading(true)
    try {
      const url = new URL("/api/threads", window.location.origin)
      if (query) url.searchParams.set("q", query)
      const res = await fetch(url.toString())
      if (res.ok) {
        const data = await res.json()
        setThreads(data.threads)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) fetchThreads()
  }, [isOpen, fetchThreads])

  // Debounced search
  useEffect(() => {
    if (!isOpen) return
    const timer = setTimeout(() => fetchThreads(search || undefined), 300)
    return () => clearTimeout(timer)
  }, [search, isOpen, fetchThreads])

  const handleSelect = (threadId: string) => {
    setIsOpen(false)
    router.push(`/chat?thread=${threadId}`)
  }

  const handleDelete = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    if (!confirm(labels.deleteConfirm)) return
    try {
      const res = await fetch(`/api/threads/${threadId}`, { method: "DELETE" })
      if (res.ok) setThreads((prev) => prev.filter((t) => t.id !== threadId))
    } catch {
      // Silently fail
    }
  }

  const displayTitle = currentTitle || "Quorum"

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)] hover:text-[var(--foreground)]/80 transition-colors max-w-[200px] sm:max-w-[300px]"
      >
        <span className="truncate">{displayTitle}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-[var(--border)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={labels.search}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
                  autoFocus
                />
              </div>
            </div>

            {/* New debate button */}
            <button
              onClick={() => { setIsOpen(false); onNewDebate() }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--primary)] hover:bg-[var(--accent)] transition-colors"
            >
              <Plus className="w-4 h-4" />
              {labels.newDebate}
            </button>

            {/* Thread list */}
            <div className="max-h-64 overflow-y-auto thin-scrollbar">
              {loading ? (
                <div className="p-4 text-center text-sm text-[var(--muted-foreground)]">...</div>
              ) : threads.length === 0 ? (
                <div className="p-4 text-center text-sm text-[var(--muted-foreground)]">
                  {labels.noThreads}
                </div>
              ) : (
                threads.map((thread) => (
                  <div
                    key={thread.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(thread.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelect(thread.id) } }}
                    className={cn(
                      "w-full text-left px-3 py-2.5 hover:bg-[var(--accent)] transition-colors group cursor-pointer",
                      thread.id === currentThreadId && "bg-[var(--accent)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--foreground)] truncate">
                          {thread.title}
                        </p>
                        {thread.verdicts[0] && (
                          <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                            {thread.verdicts[0].recommendation}
                            <span className="ml-1 opacity-60">
                              ({thread.verdicts[0].confidence}%)
                            </span>
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {timeAgo(thread.updatedAt, locale)}
                          </span>
                          {thread.status === "active" && (
                            <span className="text-xs text-green-500">{labels.active}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, thread.id)}
                        aria-label={locale === "ko" ? "토론 삭제" : "Delete thread"}
                        className="shrink-0 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--muted-foreground)] hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
