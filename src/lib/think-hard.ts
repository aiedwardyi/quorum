/** Think hard mode: bigger models with light thinking, falling back to fast mode on failure. */
import type { Locale } from "@/types"

// CloudFront's origin response timeout (30s default) is a no-data timer, so a think-hard
// panelist must start answering within this; once text streams it may run to the stream cap.
export const THINK_HARD_FIRST_TEXT_MS = 25_000
export const THINK_HARD_STREAM_CAP_MS = 120_000
// The verdict is one non-streamed response, so the whole call must fit the no-data window.
export const THINK_HARD_VERDICT_MS = 25_000
// Thinking tokens count against the output cap on every provider.
export const THINK_HARD_EXTRA_TOKENS = 8192

export const THINK_HARD_STORAGE_KEY = "quorum_thinkHard"

export function parseStoredThinkHard(value: string | null): boolean {
  return value === "true"
}

export const THINK_HARD_COPY: Record<
  Locale,
  { label: string; hint: string; thinking: string; fellBack: string }
> = {
  en: {
    label: "Think hard",
    hint: "Slower, more careful answers",
    thinking: "Thinking…",
    fellBack: "Think hard took too long, so this is a quick answer.",
  },
  ko: {
    label: "깊이 생각",
    hint: "느리지만 더 신중한 답변",
    thinking: "생각 중…",
    fellBack: "깊이 생각이 너무 오래 걸려 빠른 답변으로 대신했어요.",
  },
}

export class ThinkHardTimeoutError extends Error {
  constructor() {
    super("think_hard_timeout")
  }
}

/** Throws ThinkHardTimeoutError if the first item misses firstMs or the stream outlives capMs. */
export async function* withThinkHardDeadlines<T>(
  iterable: AsyncIterable<T>,
  firstMs = THINK_HARD_FIRST_TEXT_MS,
  capMs = THINK_HARD_STREAM_CAP_MS
): AsyncGenerator<T> {
  const start = Date.now()
  const iterator = iterable[Symbol.asyncIterator]()
  let deadline = start + firstMs
  while (true) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race<IteratorResult<T> | "timeout">([
      iterator.next(),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), Math.max(0, deadline - Date.now()))
      }),
    ]).finally(() => clearTimeout(timer))
    if (result === "timeout") {
      void iterator.return?.(undefined)
      throw new ThinkHardTimeoutError()
    }
    if (result.done) return
    deadline = start + capMs
    yield result.value
  }
}

/** Runs the think-hard attempt; on any failure runs the fast attempt once instead. */
export async function withFastFallback<T>(
  thinkHard: boolean,
  attempt: (thinkHard: boolean) => Promise<T>,
  failed: (result: T) => boolean
): Promise<{ result: T; fellBack: boolean }> {
  if (!thinkHard) return { result: await attempt(false), fellBack: false }
  try {
    const result = await attempt(true)
    if (!failed(result)) return { result, fellBack: false }
  } catch {
    // Any think-hard failure falls through to fast mode.
  }
  return { result: await attempt(false), fellBack: true }
}
