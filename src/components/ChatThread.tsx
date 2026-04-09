"use client"

import { useEffect, useRef } from "react"
import { Message, Provider, Locale, ResponseLength } from "@/types"
import ChatBubble from "@/components/ChatBubble"
import WelcomeHero from "@/components/WelcomeHero"

export default function ChatThread({
  messages,
  typingModel,
  locale,
  activeModels,
  responseLength,
  onSendMessage,
  onNewDiscussion,
}: {
  messages: Message[]
  typingModel?: Provider | null
  locale: Locale
  activeModels: Provider[]
  responseLength?: ResponseLength
  onSendMessage: (text: string) => void
  onNewDiscussion?: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const isNearBottom = useRef(true)

  const hasMessages = messages.length > 0 || !!typingModel

  useEffect(() => {
    const main = bottomRef.current?.closest("main")
    if (!main) return
    const handleScroll = () => {
      const distFromBottom = main.scrollHeight - main.scrollTop - main.clientHeight
      isNearBottom.current = distFromBottom < 150
    }
    main.addEventListener("scroll", handleScroll)
    return () => main.removeEventListener("scroll", handleScroll)
  }, [hasMessages])

  useEffect(() => {
    const lastMsg = messages[messages.length - 1]
    const userJustSent = lastMsg?.sender === "user"
    if (isNearBottom.current || userJustSent) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, typingModel])

  if (messages.length === 0 && !typingModel) {
    return (
      <div className="w-full">
        <WelcomeHero locale={locale} activeModels={activeModels} onSuggestionClick={onSendMessage} />
      </div>
    )
  }

  return (
    <div className="px-4 py-6" role="log">
      <div className="max-w-3xl mx-auto w-full flex flex-col">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} locale={locale} responseLength={responseLength} onNewDiscussion={onNewDiscussion} />
        ))}
        <div ref={bottomRef} className="h-4" />
      </div>
    </div>
  )
}
