"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { computeNextDisplayedLength, getPacingForProvider } from "@/lib/smooth-stream"
import { reportDrained } from "@/lib/drain-registry"

/**
 * Smoothes a streaming text target into a paced, character-by-character
 * display. The chat engine pushes the latest accumulated `targetText`,
 * the hook returns the currently visible substring, advanced on every
 * animation frame at a buffer-aware rate.
 *
 * Respects prefers-reduced-motion: returns the full target immediately.
 *
 * @param targetText  The latest full target text from the chat engine.
 * @param isStreaming True while the network stream is still open.
 *                    The hook keeps draining the buffer after this flips
 *                    false until displayed catches up to target.
 * @param provider    Optional provider id used to look up per-provider
 *                    pacing. Each provider streams at a different rate,
 *                    so we cap the visible CPS per provider to keep the
 *                    typing feel consistent across bubbles.
 * @param forceComplete When true, the hook snaps immediately to the full
 *                      target length and cancels any pending rAF. Used to
 *                      prevent a stale bubble from visibly draining while
 *                      another bubble has taken over the stream - e.g.
 *                      long-mode tail overlap between rounds.
 */
export function useSmoothStream(
  targetText: string,
  isStreaming: boolean,
  provider?: string | null,
  forceComplete?: boolean,
  messageId?: string | null
): string {
  // Visible length. Initialize to the full target length so a freshly
  // mounted bubble for an existing (already-finished) message renders
  // immediately instead of typing itself out.
  const [displayedLength, setDisplayedLength] = useState<number>(() => targetText.length)

  // Refs the rAF tick reads. Using refs (not state) avoids stale closures
  // and lets the tick read the latest values without re-creating itself.
  // Initialized from the current props/state; the layout effect below
  // keeps them in sync on subsequent renders. We cannot mirror during
  // render itself because the react-hooks/refs rule (React 19) bans
  // writing refs during render.
  const targetRef = useRef<string>(targetText)
  const isStreamingRef = useRef<boolean>(isStreaming)
  const displayedLengthRef = useRef<number>(displayedLength)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const reducedMotionRef = useRef<boolean>(false)
  const pacingRef = useRef(getPacingForProvider(provider))
  const messageIdRef = useRef<string | null>(messageId ?? null)
  // Guard so we only report drained once per message id - prevents a
  // second tick after a brief stall from re-firing the event.
  const drainedReportedForRef = useRef<string | null>(null)
  // The rAF tick. Defined once via useRef so we have a single stable
  // function reference to schedule across renders. The current value
  // is installed by the layout effect below.
  const tickRef = useRef<(ts: number) => void>(() => {})

  // Stable callback - useCallback with an empty dep array is safe
  // here because the body only reads refs and calls a module-level
  // function (reportDrained). Stable identity lets the tick installer
  // below run exactly once instead of once per render.
  const fireDrainIfDone = useCallback(() => {
    const id = messageIdRef.current
    if (!id) return
    if (isStreamingRef.current) return
    if (targetRef.current.length > displayedLengthRef.current) return
    if (drainedReportedForRef.current === id) return
    drainedReportedForRef.current = id
    reportDrained(id)
  }, [])

  // Mirror the latest render inputs into refs. The dep array keeps
  // this from firing during the 60fps displayedLength churn - those
  // re-renders already update displayedLengthRef directly from inside
  // the tick and the forceComplete/reducedMotion/truncation effects,
  // so we don't need to mirror displayedLength here.
  useLayoutEffect(() => {
    targetRef.current = targetText
    isStreamingRef.current = isStreaming
    pacingRef.current = getPacingForProvider(provider)
    messageIdRef.current = messageId ?? null
  }, [targetText, isStreaming, provider, messageId])

  // Install the rAF tick once on mount. The closure below reads only
  // refs and the stable fireDrainIfDone callback, so a single install
  // is correct for the lifetime of the component. Re-installing this
  // function on every render (the previous behavior) was running a
  // layout effect every animation frame during streaming and adding
  // avoidable main-thread work.
  useLayoutEffect(() => {
    tickRef.current = (ts: number) => {
      const last = lastTsRef.current ?? ts
      const dtMs = ts - last
      lastTsRef.current = ts

      const next = computeNextDisplayedLength({
        displayed: displayedLengthRef.current,
        target: targetRef.current.length,
        dtMs,
        // Once the network stream has ended, drain the remaining buffer
        // at the provider's turboCps so a fast provider's tail doesn't
        // sit visibly finishing for seconds while the next model starts
        // talking. This replaces the earlier hard snap which caused a
        // visible paragraph-dump at handoff.
        turbo: !isStreamingRef.current,
        pacing: pacingRef.current,
      })

      if (next !== displayedLengthRef.current) {
        displayedLengthRef.current = next
        setDisplayedLength(next)
      }

      // Only keep the rAF loop running while there is pending content
      // to render. If we caught up but the network stream is still
      // open, stop the loop - the targetText effect will restart it
      // when the next chunk arrives. The earlier
      // `stillBehind || isStreaming` condition kept the loop spinning
      // at 60fps doing no work during provider stalls between chunks.
      const stillBehind = targetRef.current.length > displayedLengthRef.current
      if (stillBehind) {
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t))
      } else {
        rafRef.current = null
        lastTsRef.current = null
        if (!isStreamingRef.current) {
          fireDrainIfDone()
        }
      }
    }
  }, [fireDrainIfDone])

  // Detect reduced-motion preference. Toggles mid-stream apply immediately:
  // turning reduce ON cancels any in-flight rAF and snaps the visible text to
  // the full target so the animation stops on the next paint. Turning reduce
  // OFF kicks the rAF loop back on if there is still buffered content to
  // drain. Without this the preference change only took effect on the next
  // targetText update, which could be seconds away.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    reducedMotionRef.current = mql.matches
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
      if (e.matches) {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        lastTsRef.current = null
        const full = targetRef.current.length
        if (displayedLengthRef.current !== full) {
          displayedLengthRef.current = full
          setDisplayedLength(full)
        }
        if (!isStreamingRef.current) {
          fireDrainIfDone()
        }
        return
      }
      if (
        rafRef.current == null &&
        targetRef.current.length > displayedLengthRef.current
      ) {
        lastTsRef.current = null
        rafRef.current = requestAnimationFrame((t) => tickRef.current(t))
      }
    }
    mql.addEventListener?.("change", onChange)
    return () => mql.removeEventListener?.("change", onChange)
  }, [fireDrainIfDone])

  // React to target changes: snap on truncation, kick off the rAF loop
  // if we're behind and one isn't already running. The setState calls
  // below are an intentional imperative sync from the latest target
  // into the visible state - we disable react-hooks/set-state-in-effect
  // because the rule's generic "derive from props" guidance does not
  // apply here (the state is a paced substring of the prop, not the
  // prop itself).
  useEffect(() => {
    if (reducedMotionRef.current) {
      displayedLengthRef.current = targetText.length
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplayedLength(targetText.length)
      fireDrainIfDone()
      return
    }

    // Truncation (engine shrunk the target - Stop button or short clamp).
    if (targetText.length < displayedLengthRef.current) {
      displayedLengthRef.current = targetText.length
      setDisplayedLength(targetText.length)
    }

    if (rafRef.current == null && targetText.length > displayedLengthRef.current) {
      lastTsRef.current = null
      rafRef.current = requestAnimationFrame((t) => tickRef.current(t))
    }
  }, [targetText, fireDrainIfDone])

  // When isStreaming flips false and there's still buffered content to
  // drain but no rAF is currently scheduled (e.g. the hook had caught up
  // momentarily and stopped before the final content update arrived), kick
  // a new rAF so the turbo drain path runs. If displayed is already at
  // full when the stream ends, fire the drain event directly so the
  // engine's waitForDrain doesn't sit through its timeout.
  useEffect(() => {
    if (isStreaming) return
    if (rafRef.current != null) return
    if (targetText.length <= displayedLengthRef.current) {
      fireDrainIfDone()
      return
    }
    lastTsRef.current = null
    rafRef.current = requestAnimationFrame((t) => tickRef.current(t))
  }, [isStreaming, targetText, fireDrainIfDone])

  // When forceComplete flips true, snap instantly to the full target and
  // cancel any pending rAF. Driven by ChatThread when the analyzing phase
  // has begun - this prevents the last bubble's tail drain from
  // overlapping the verdict skeleton card. The setDisplayedLength call
  // below is an intentional imperative sync; see the comment on the
  // targetText effect for why the lint rule is disabled here.
  useEffect(() => {
    if (!forceComplete) return
    if (targetText.length <= displayedLengthRef.current) {
      fireDrainIfDone()
      return
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTsRef.current = null
    displayedLengthRef.current = targetText.length
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDisplayedLength(targetText.length)
    fireDrainIfDone()
  }, [forceComplete, targetText, fireDrainIfDone])

  // Cancel any pending frame on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  // When forceComplete is true we return the full target text
  // synchronously during render, not in a useEffect. The useEffect above
  // still syncs displayedLength state on the next tick, but the initial
  // render cycle after forceComplete flips must already show the full
  // content - otherwise there is a one-frame window where the caret is
  // still visible alongside the verdict skeleton, which the Playwright
  // probe catches as a 20-40ms sk1+c1 overlap. Short-circuiting here
  // closes that window.
  if (forceComplete && displayedLength < targetText.length) {
    return targetText
  }

  return targetText.slice(0, displayedLength)
}
