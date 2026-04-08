"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Trash2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import type { ThreadSummary, Locale } from "@/types"
import { timeAgo } from "@/lib/time"

const t = {
  en: {
    search: "Search threads...",
    newDebate: "New Debate",
    noThreads: "No past debates",
    active: "Active",
  },
  ko: {
    search: "토론 검색...",
    newDebate: "새 토론",
    noThreads: "이전 토론이 없습니다",
    active: "진행 중",
  },
}

export default function ThreadDropdown({
  currentThreadId,
  currentTitle,
  locale,
  onNewDebate,
  onDeleteCurrent,
}: {
  currentThreadId: string | null
  currentTitle: string | null
  locale: Locale
  onNewDebate: () => void
  onDeleteCurrent?: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const isNavigatingRef = useRef(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
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

  // Fetch on open, reset state, focus search
  const skipNextSearchEffect = useRef(false)
  useEffect(() => {
    if (!isOpen) return
    skipNextSearchEffect.current = true
    setSearch("")
    setConfirmDeleteId(null)
    fetchThreads()
    const rafId = requestAnimationFrame(() => searchInputRef.current?.focus())
    return () => cancelAnimationFrame(rafId)
  }, [isOpen, fetchThreads])

  // Debounced search (only when user types, not on programmatic reset)
  useEffect(() => {
    if (!isOpen) return
    if (skipNextSearchEffect.current) { skipNextSearchEffect.current = false; return }
    const timer = setTimeout(() => fetchThreads(search || undefined), 300)
    return () => clearTimeout(timer)
  }, [search, isOpen, fetchThreads])

  // Auto-dismiss confirm state after 3s
  useEffect(() => {
    if (!confirmDeleteId) return
    const timer = setTimeout(() => setConfirmDeleteId(null), 3000)
    return () => clearTimeout(timer)
  }, [confirmDeleteId])

  // Reset navigation flag when the active thread changes (navigation completed)
  useEffect(() => {
    isNavigatingRef.current = false
  }, [currentThreadId])

  const handleSelect = (threadId: string) => {
    if (threadId === currentThreadId) {
      setIsOpen(false)
      return
    }
    // Close before navigation to minimize visible flicker during the route change
    isNavigatingRef.current = true
    setIsOpen(false)
    router.push(`/chat?thread=${threadId}`)
  }

  const handleDelete = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation()
    e.preventDefault()
    if (confirmDeleteId === threadId) {
      try {
        const res = await fetch(`/api/threads/${threadId}`, { method: "DELETE" })
        if (res.ok) {
          setThreads((prev) => prev.filter((t) => t.id !== threadId))
          if (threadId === currentThreadId && onDeleteCurrent) {
            onDeleteCurrent()
          }
        }
      } catch {
        // Silently fail
      }
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(threadId)
    }
  }

  const handleToggle = () => {
    if (isNavigatingRef.current) return
    setIsOpen((prev) => !prev)
  }

  const displayTitle = currentTitle || "Quorum"

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)] hover:text-[var(--foreground)]/80 transition-colors max-w-[200px] sm:max-w-[300px]"
      >
        <span className="truncate">{displayTitle}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            key="thread-dropdown"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute top-full left-0 mt-2 w-[calc(100vw-2rem)] sm:w-80 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Search */}
            <div className="p-2 border-b border-[var(--border)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={labels.search}
                  className="w-full pl-8 pr-3 py-2 sm:py-1.5 text-sm bg-transparent text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] outline-none"
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
                      "w-full text-left px-3 py-2.5 hover:bg-[var(--accent)] transition-colors group cursor-pointer min-h-[48px]",
                      thread.id === currentThreadId && "bg-[var(--accent)]",
                      confirmDeleteId === thread.id && "bg-red-50/50 dark:bg-red-900/10"
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
                      {confirmDeleteId === thread.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                            className="p-1 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                          >
                            {locale === "ko" ? "취소" : "Cancel"}
                          </button>
                          <button
                            onClick={(e) => handleDelete(e, thread.id)}
                            className="p-1 px-2 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                          >
                            {locale === "ko" ? "삭제" : "Delete"}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => handleDelete(e, thread.id)}
                          aria-label={locale === "ko" ? "토론 삭제" : "Delete thread"}
                          className="shrink-0 p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 text-[var(--muted-foreground)] hover:text-red-500 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
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
