"use client"

import { ConsensusResult } from "@/types"

type Props = {
  score: number | null
  result: ConsensusResult | null
}

// Pick a color based on how high the score is
function getColor(score: number): string {
  if (score >= 80) return "#22C55E"  // Green — strong consensus
  if (score >= 50) return "#EAB308"  // Yellow — partial agreement
  return "#EF4444"                    // Red — disagreement
}

export default function ConsensusMeter({ score, result }: Props) {
  // If we haven't run consensus yet, show a placeholder
  if (score === null) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <p className="text-xs text-gray-400">No consensus data yet</p>
      </div>
    )
  }

  const color = getColor(score)

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
      {/* Label + percentage */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Consensus</span>
        <span className="text-sm font-bold" style={{ color }}>
          {score}%
        </span>
      </div>

      {/* The progress bar track */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        {/* The filled portion — width is the score percentage */}
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>

      {/* Short summary text underneath */}
      {result?.summary && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{result.summary}</p>
      )}
    </div>
  )
}
