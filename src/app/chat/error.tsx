"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import Link from "next/link"

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.error("Chat error boundary caught:", error)
    }
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground font-[family-name:var(--font-geist-sans)] px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-zinc-100 dark:bg-zinc-800 p-4">
            <AlertTriangle className="w-8 h-8 text-zinc-500 dark:text-zinc-400" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            The debate encountered an error
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Something went wrong during the debate. You can retry or start fresh.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Home className="w-4 h-4" />
            Start new debate
          </Link>
        </div>
      </div>
    </div>
  )
}
