"use client"

import { ConsensusResult } from "@/types"
import { Button } from "@/components/ui/button"

type Props = {
  result: ConsensusResult
  onNewDiscussion: () => void
}

export default function SummaryCard({ result, onNewDiscussion }: Props) {
  return (
    <div className="mx-4 my-6 rounded-2xl border border-green-200 bg-green-50 p-6 dark:border-green-800 dark:bg-green-950/30">
      {/* Header with score badge */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Discussion Summary
        </h3>
        <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white">
          {result.score}% Consensus
        </span>
      </div>

      {/* Summary paragraph */}
      <p className="mb-4 text-sm text-gray-700 dark:text-gray-300">{result.summary}</p>

      {/* Agreements list */}
      {result.agreements.length > 0 && (
        <div className="mb-3">
          <h4 className="mb-1 text-xs font-semibold text-green-700 dark:text-green-400">
            Agreements
          </h4>
          <ul className="space-y-1">
            {result.agreements.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="mt-0.5 text-green-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Disagreements list */}
      {result.disagreements.length > 0 && (
        <div className="mb-4">
          <h4 className="mb-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
            Disagreements
          </h4>
          <ul className="space-y-1">
            {result.disagreements.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="mt-0.5 text-amber-500">✗</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* New Discussion button */}
      <Button onClick={onNewDiscussion} variant="outline" className="w-full">
        Start New Discussion
      </Button>
    </div>
  )
}
