"use client"

import { useEffect, useRef } from "react"
import { Message } from "@/types"
import ChatBubble from "./ChatBubble"

export default function ChatThread({ messages }: { messages: Message[] }) {
  // useRef gives us a handle to a DOM element so we can scroll it programmatically
  const bottomRef = useRef<HTMLDivElement>(null)

  // useEffect runs code AFTER the component renders.
  // Here: every time `messages` changes, scroll to the invisible div at the bottom.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center text-gray-400 text-sm">
          Start a discussion to see messages here
        </div>
      ) : (
        messages.map((msg) => <ChatBubble key={msg.id} message={msg} />)
      )}
      {/* Invisible element at the bottom — we scroll to this */}
      <div ref={bottomRef} />
    </div>
  )
}
