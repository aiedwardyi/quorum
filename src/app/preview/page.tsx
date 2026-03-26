"use client"

import { useState } from "react"
import { Message, Provider, ConsensusResult } from "@/types"
import ChatThread from "@/components/ChatThread"
import MessageInput from "@/components/MessageInput"
import ConsensusMeter from "@/components/ConsensusMeter"
import ModelSelector from "@/components/ModelSelector"
import SummaryCard from "@/components/SummaryCard"

// Fake messages to preview the chat UI
const MOCK_MESSAGES: Message[] = [
  {
    id: "1",
    sender: "user",
    displayName: "You",
    content: "Should we use a monorepo or separate repos for our microservices?",
    timestamp: new Date("2026-03-26T10:00:00"),
  },
  {
    id: "2",
    sender: "gemini",
    displayName: "Gemini",
    content:
      "A monorepo has clear advantages here — shared tooling, atomic commits across services, and easier dependency management. Tools like Turborepo or Nx make this practical even at scale.",
    timestamp: new Date("2026-03-26T10:00:15"),
  },
  {
    id: "3",
    sender: "perplexity",
    displayName: "Perplexity",
    content:
      "I'd lean toward separate repos. Monorepos introduce build complexity and CI bottlenecks. With good API contracts and versioning, separate repos give teams more autonomy and cleaner ownership boundaries.",
    timestamp: new Date("2026-03-26T10:00:30"),
  },
  {
    id: "4",
    sender: "user",
    displayName: "You",
    content: "We only have a team of 4 devs right now. Does that change anything?",
    timestamp: new Date("2026-03-26T10:01:00"),
  },
  {
    id: "5",
    sender: "gemini",
    displayName: "Gemini",
    content:
      "With a small team, a monorepo is even more compelling. You avoid the overhead of managing multiple CI pipelines and package versions. Keep it simple while you're small.",
    timestamp: new Date("2026-03-26T10:01:15"),
  },
  {
    id: "6",
    sender: "perplexity",
    displayName: "Perplexity",
    content:
      "Fair point. For a 4-person team, the operational overhead of separate repos probably isn't worth it yet. I'd agree — start with a monorepo and split later if needed.",
    timestamp: new Date("2026-03-26T10:01:30"),
  },
]

const MOCK_CONSENSUS: ConsensusResult = {
  score: 85,
  agreements: [
    "Monorepo is the better choice for a small team of 4",
    "Shared tooling reduces overhead at this scale",
    "Can migrate to separate repos later if team grows",
  ],
  disagreements: ["Optimal long-term scaling strategy differs"],
  summary:
    "Both models agree that a monorepo is the practical choice for a small team, with the option to split repos later as the team and codebase grow.",
}

export default function PreviewPage() {
  const [activeModels, setActiveModels] = useState<Provider[]>(["gemini", "perplexity"])
  const [showSummary, setShowSummary] = useState(false)

  const handleToggle = (model: Provider) => {
    setActiveModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    )
  }

  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 p-4 dark:border-gray-700">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Quorum — Component Preview
        </h1>
        <p className="text-xs text-gray-500">All 6 components rendered with mock data</p>
      </div>

      {/* Top bar: Model selector + Consensus meter */}
      <div className="flex items-center justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-700">
        <ModelSelector activeModels={activeModels} onToggle={handleToggle} />
        <div className="w-64">
          <ConsensusMeter score={85} result={MOCK_CONSENSUS} />
        </div>
      </div>

      {/* Chat thread */}
      <ChatThread messages={MOCK_MESSAGES} />

      {/* Summary card (toggle) */}
      {showSummary && (
        <SummaryCard result={MOCK_CONSENSUS} onNewDiscussion={() => setShowSummary(false)} />
      )}

      {/* Toggle summary button */}
      <div className="flex justify-center py-2">
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="text-xs text-blue-500 hover:underline"
        >
          {showSummary ? "Hide" : "Show"} Summary Card
        </button>
      </div>

      {/* Input bar */}
      <MessageInput
        onSend={(text, model) => console.log("Send:", text, "to:", model)}
        onStop={() => console.log("Stop clicked")}
        disabled={false}
        activeModels={activeModels}
      />
    </div>
  )
}
