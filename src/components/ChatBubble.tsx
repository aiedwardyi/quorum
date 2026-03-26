"use client"

import { Message } from "@/types"

// Each AI model gets its own color so you can tell who said what at a glance
const MODEL_COLORS: Record<string, string> = {
  gemini: "#3B82F6",     // Blue
  perplexity: "#14B8A6", // Teal
}

export default function ChatBubble({ message }: { message: Message }) {
  const isUser = message.sender === "user"
  const accentColor = isUser ? undefined : MODEL_COLORS[message.sender]

  // Format the timestamp into something readable like "3:45 PM"
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[75%] ${isUser ? "order-1" : ""}`}>
        {/* Sender name + timestamp header */}
        <div className={`flex items-center gap-2 mb-1 ${isUser ? "justify-end" : ""}`}>
          <span
            className="text-xs font-semibold"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {message.displayName}
          </span>
          <span className="text-xs text-gray-400">{time}</span>
        </div>

        {/* The actual message bubble */}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
          }`}
          style={
            !isUser && accentColor
              ? { borderLeft: `3px solid ${accentColor}` }
              : undefined
          }
        >
          {message.content}
        </div>
      </div>
    </div>
  )
}
