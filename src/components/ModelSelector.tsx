"use client"

import { Provider } from "@/types"

type Props = {
  activeModels: Provider[]
  onToggle: (model: Provider) => void
}

const MODEL_INFO: Record<Provider, { label: string; color: string }> = {
  gemini:     { label: "Gemini",     color: "#3B82F6" },
  perplexity: { label: "Perplexity", color: "#14B8A6" },
}

export default function ModelSelector({ activeModels, onToggle }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">Models:</span>

      {/* Loop over each provider and render a clickable badge */}
      {(Object.keys(MODEL_INFO) as Provider[]).map((model) => {
        const isActive = activeModels.includes(model)
        const info = MODEL_INFO[model]

        return (
          <button
            key={model}
            onClick={() => onToggle(model)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium
                        transition-all ${
                          isActive
                            ? "text-white shadow-sm"
                            : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                        }`}
            style={isActive ? { backgroundColor: info.color } : undefined}
          >
            {/* Small colored dot */}
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: isActive ? "white" : info.color }}
            />
            {info.label}
          </button>
        )
      })}
    </div>
  )
}
