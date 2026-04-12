"use client"

import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"

function ChatRedirect() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const thread = searchParams.get("thread")

  useEffect(() => {
    // Redirect /chat and /chat?thread=xxx to / and /?thread=xxx
    const url = thread ? `/?thread=${thread}` : "/"
    router.replace(url)
  }, [router, thread])

  return (
    <div className="flex items-center justify-center h-screen bg-background text-foreground">
      <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-zinc-600 dark:border-t-zinc-300 rounded-full animate-spin" />
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatRedirect />
    </Suspense>
  )
}
