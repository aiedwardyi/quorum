"use client"

import { useState } from "react"
import { Provider } from "@/types"
import { Button } from "@/components/ui/button"

type Props = {
  onSend: (text: string, model: Provider | "all") => void
  onStop: () => void
  disabled: boolean
  activeModels: Provider[]
}

export default function MessageInput({ onSend, onStop, disabled, activeModels }: Props) {
  // Local state for what the user is typing and which model they picked
  const [text, setText] = useState("")
  const [target, setTarget] = useState<Provider | "all">("all")

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed) return      // Don't send empty messages
    onSend(trimmed, target)   // Call the parent's send function
    setText("")               // Clear the input after sending
  }

  // Let the user press Enter to send (Shift+Enter for new line)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()  // Prevent adding a newline
      handleSend()
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-end gap-2">
        {/* Text input area — grows taller as you type more */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm
                     focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100
                     disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100
                     dark:focus:border-blue-500 dark:focus:ring-blue-900"
        />

        {/* Model picker dropdown — choose who speaks next */}
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as Provider | "all")}
          disabled={disabled}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm
                     dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          <option value="all">All (Round Robin)</option>
          {activeModels.map((m) => (
            <option key={m} value={m}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </option>
          ))}
        </select>

        {/* Send button */}
        <Button onClick={handleSend} disabled={disabled || !text.trim()}>
          Send
        </Button>

        {/* Stop button — ends the debate */}
        <Button variant="destructive" onClick={onStop} disabled={!disabled}>
          Stop
        </Button>
      </div>
    </div>
  )
}
