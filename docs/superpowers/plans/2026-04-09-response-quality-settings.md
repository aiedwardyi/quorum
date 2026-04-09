# Response Quality & Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance summary card with structured Gemini-style output scaled to response length, add collapsible AI responses, add round selector to header, and deduplicate settings.

**Architecture:** Extend VerdictResult type with optional structured fields. Update verdict prompt to scale output by response length. Thread responseLength through consensus API. Add collapse/expand to ChatBubble. Add rounds dropdown to Header matching response length pattern. Remove rounds from SettingsModal.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, Framer Motion, Lucide icons

---

### Task 1: Extend VerdictResult type with new optional fields

**Files:**
- Modify: `src/types.ts:19-27`

- [ ] **Step 1: Add new optional fields to VerdictResult**

In `src/types.ts`, replace the VerdictResult type:

```typescript
export type VerdictResult = {
  recommendedAnswer: string
  voteSplit: string
  confidence: number
  reasons: string[]
  minorityView: string
  oppositeCase: string
  modelAgreement?: number
  analysis?: string
  keyTakeaways?: string[]
  actionItems?: string[]
}
```

- [ ] **Step 2: Update client-side verdict validation in useDebateEngine**

In `src/hooks/useDebateEngine.ts`, the `isValidVerdict` function (lines 44-57) validates verdict objects client-side. The new fields are optional, so the existing validation still works. No changes needed here - verify by reading the function.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend VerdictResult with analysis, keyTakeaways, actionItems fields"
```

---

### Task 2: Update verdict validation to accept new fields

**Files:**
- Modify: `src/lib/validate-verdict.ts`

- [ ] **Step 1: Add validation for new optional fields**

In `src/lib/validate-verdict.ts`, add validation after the `modelAgreement` check (after line 44) and include new fields in the return object.

Replace the full function body. The new `validateVerdictResult` function:

```typescript
import type { VerdictResult } from "@/types"

export function validateVerdictResult(raw: unknown): VerdictResult {
  if (!raw || typeof raw !== "object") {
    throw new Error("Verdict response is not an object")
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.recommendedAnswer !== "string" || !obj.recommendedAnswer.trim()) {
    throw new Error("recommendedAnswer must be a non-empty string")
  }

  if (typeof obj.voteSplit !== "string" || !obj.voteSplit.trim()) {
    throw new Error("voteSplit must be a non-empty string")
  }

  if (typeof obj.confidence !== "number" || !Number.isFinite(obj.confidence) || obj.confidence < 0 || obj.confidence > 100) {
    throw new Error("confidence must be a finite number between 0 and 100")
  }

  if (!Array.isArray(obj.reasons) || obj.reasons.length === 0) {
    throw new Error("reasons must be a non-empty array")
  }

  for (let i = 0; i < obj.reasons.length; i++) {
    if (typeof obj.reasons[i] !== "string") {
      throw new Error(`reasons[${i}] must be a string`)
    }
  }

  if (typeof obj.minorityView !== "string" || !obj.minorityView.trim()) {
    throw new Error("minorityView must be a non-empty string")
  }

  if (typeof obj.oppositeCase !== "string" || !obj.oppositeCase.trim()) {
    throw new Error("oppositeCase must be a non-empty string")
  }

  if (obj.modelAgreement !== undefined) {
    if (typeof obj.modelAgreement !== "number" || !Number.isFinite(obj.modelAgreement) || obj.modelAgreement < 0 || obj.modelAgreement > 100) {
      throw new Error("modelAgreement must be a finite number between 0 and 100")
    }
  }

  // Validate optional structured fields
  if (obj.analysis !== undefined && typeof obj.analysis !== "string") {
    throw new Error("analysis must be a string")
  }

  if (obj.keyTakeaways !== undefined) {
    if (!Array.isArray(obj.keyTakeaways)) {
      throw new Error("keyTakeaways must be an array")
    }
    for (let i = 0; i < obj.keyTakeaways.length; i++) {
      if (typeof obj.keyTakeaways[i] !== "string") {
        throw new Error(`keyTakeaways[${i}] must be a string`)
      }
    }
  }

  if (obj.actionItems !== undefined) {
    if (!Array.isArray(obj.actionItems)) {
      throw new Error("actionItems must be an array")
    }
    for (let i = 0; i < obj.actionItems.length; i++) {
      if (typeof obj.actionItems[i] !== "string") {
        throw new Error(`actionItems[${i}] must be a string`)
      }
    }
  }

  return {
    recommendedAnswer: obj.recommendedAnswer,
    voteSplit: obj.voteSplit,
    confidence: obj.confidence,
    reasons: obj.reasons as string[],
    minorityView: obj.minorityView,
    oppositeCase: obj.oppositeCase,
    ...(obj.modelAgreement !== undefined ? { modelAgreement: obj.modelAgreement } : {}),
    ...(typeof obj.analysis === "string" ? { analysis: obj.analysis } : {}),
    ...(Array.isArray(obj.keyTakeaways) ? { keyTakeaways: obj.keyTakeaways as string[] } : {}),
    ...(Array.isArray(obj.actionItems) ? { actionItems: obj.actionItems as string[] } : {}),
  }
}
```

- [ ] **Step 2: Verify the app still compiles**

Run: `npx next build --no-lint 2>&1 | head -20` (or `npm run build`)
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/validate-verdict.ts
git commit -m "feat: validate new optional verdict fields (analysis, keyTakeaways, actionItems)"
```

---

### Task 3: Update verdict prompt to scale by response length

**Files:**
- Modify: `src/lib/verdict-prompt.ts`

- [ ] **Step 1: Update getVerdictPrompt to accept responseLength**

Replace the full file `src/lib/verdict-prompt.ts`:

```typescript
import type { Locale, ResponseLength } from "@/types"

export function getVerdictPrompt(locale: Locale, responseLength: ResponseLength = "medium"): string {
  const localeRule = locale === "ko"
    ? "\n- Return ALL text fields (recommendedAnswer, voteSplit, reasons, minorityView, oppositeCase, analysis, keyTakeaways, actionItems) in Korean."
    : ""

  const shortSchema = `{
  "recommendedAnswer": "One short decisive sentence. Maximum 15 words. Start with a verb.",
  "voteSplit": "3/4 models agree",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2"],
  "minorityView": "Strongest counterargument in one sentence",
  "oppositeCase": "When the opposite would be better, in one sentence"
}`

  const mediumSchema = `{
  "recommendedAnswer": "A clear, decisive recommendation in 1-2 sentences. Start with a verb.",
  "voteSplit": "3/4 models agree",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2", "reason 3"],
  "minorityView": "The strongest argument against the recommendation, in 1-2 sentences",
  "oppositeCase": "When the opposite choice would actually be better, in one sentence",
  "keyTakeaways": [
    "Label - 1-2 sentence explanation of this key point",
    "Label - 1-2 sentence explanation of this key point",
    "Label - 1-2 sentence explanation of this key point"
  ]
}`

  const longSchema = `{
  "recommendedAnswer": "A clear, decisive recommendation in 1-2 sentences. Start with a verb.",
  "voteSplit": "3/4 models agree",
  "confidence": <number 0-100>,
  "reasons": ["reason 1", "reason 2", "reason 3", "reason 4"],
  "minorityView": "The strongest argument against the recommendation, in 2-3 sentences with specific reasoning",
  "oppositeCase": "When the opposite choice would actually be better, in 1-2 sentences",
  "analysis": "A 3-5 sentence paragraph synthesizing the debate. Cover where models agreed, where they disagreed, and what drove the recommendation.",
  "keyTakeaways": [
    "Label - 1-2 sentence detailed explanation of this key finding",
    "Label - 1-2 sentence detailed explanation of this key finding",
    "Label - 1-2 sentence detailed explanation of this key finding",
    "Label - 1-2 sentence detailed explanation of this key finding"
  ],
  "actionItems": [
    "Concrete next step the user should take",
    "Another specific action with enough detail to act on",
    "A third actionable recommendation"
  ]
}`

  const schema = responseLength === "short" ? shortSchema
    : responseLength === "long" ? longSchema
    : mediumSchema

  const lengthGuidance = responseLength === "short"
    ? "Keep all fields concise. recommendedAnswer must be maximum 15 words."
    : responseLength === "long"
    ? "Provide thorough, detailed responses in all fields. Include analysis, keyTakeaways (with bold-style labels like 'Type safety - catches bugs early'), and actionItems."
    : "Provide moderate detail. Include keyTakeaways with labeled points. Do NOT include analysis or actionItems."

  return `You are a decision advisor. A user asked a question and multiple AI models debated it. Your job is to deliver a clear, decisive recommendation based on the debate.

Return ONLY valid JSON with this exact structure, no other text:

${schema}

Rules:
- ${lengthGuidance}
- NEVER hedge. Never say "it depends", "both have merits", "there is no clear winner", "consider your needs", or "provide more details". NEVER ask the user for more information. You MUST pick a concrete answer even if the debate was inconclusive. If the models hedged, pick the option that had the strongest reasoning and commit to it.
- If the debate is close, still pick the stronger position. Reflect the closeness in the confidence score, not by hedging the answer.
- voteSplit MUST be a short fraction like "3/4 models agree" or "4/4 unanimous" or "2/4 models agree (split decision)". Keep it under 8 words. Do NOT list model names here.
- confidence scoring: 90-100 = strong consensus, 70-89 = clear lean, 50-69 = slight edge, below 50 = genuine toss-up (still pick one side).
- reasons: provide ${responseLength === "short" ? "2-3" : "3-4"} short, scannable bullet points supporting the recommendation. Each reason should be one sentence.
- minorityView: the single strongest counterargument. If all models agreed, write "No significant dissent."
- oppositeCase: one sentence describing when the user should ignore this recommendation and do the opposite.
- Return ONLY the JSON object. No markdown fences, no explanation, no preamble.
- If previous verdicts are included in the context, maintain consistency with them unless the continued discussion provides strong, specific new evidence that changes the answer. Stability matters: do not reverse a recommendation without clear justification from the new discussion.${localeRule}`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/verdict-prompt.ts
git commit -m "feat: scale verdict prompt detail by response length setting"
```

---

### Task 4: Thread responseLength through consensus API and debate engine

**Files:**
- Modify: `src/app/api/consensus/route.ts:49-56`
- Modify: `src/hooks/useDebateEngine.ts` (3 fetch calls to `/api/consensus`)

- [ ] **Step 1: Accept responseLength in consensus route**

In `src/app/api/consensus/route.ts`, after the locale parsing (line 56), add responseLength parsing:

```typescript
    const rawResponseLength = body.responseLength
    const responseLength: ResponseLength = rawResponseLength === "short" || rawResponseLength === "medium" || rawResponseLength === "long" ? rawResponseLength : "medium"
```

Also add the import for `ResponseLength` on line 2:

```typescript
import type { Message, Locale, ResponseLength } from "@/types"
```

Then update the `getVerdictPrompt` call on line 110 to pass responseLength:

```typescript
        parts: [{ text: getVerdictPrompt(locale, responseLength) }],
```

- [ ] **Step 2: Pass responseLength in all 3 consensus fetch calls in useDebateEngine**

In `src/hooks/useDebateEngine.ts`, there are 3 places that call `/api/consensus`. Each currently sends:

```typescript
body: JSON.stringify({ messages: getConsensusMessages(msgs), locale }),
```

Update all 3 to include responseLength:

```typescript
body: JSON.stringify({ messages: getConsensusMessages(msgs), locale, responseLength }),
```

The 3 locations are approximately:
- Line 392 (mid-debate confidence check)
- Line 493 (end-of-rounds final verdict)
- Line 595 (stop button verdict)

- [ ] **Step 3: Verify build**

Run: `npx next build --no-lint 2>&1 | head -20`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/consensus/route.ts src/hooks/useDebateEngine.ts
git commit -m "feat: pass responseLength to consensus API for scaled verdict output"
```

---

### Task 5: Update SummaryCard to render new structured sections

**Files:**
- Modify: `src/components/SummaryCard.tsx`

- [ ] **Step 1: Add translations for new sections**

In `src/components/SummaryCard.tsx`, add new translation keys to both `en` and `ko` objects inside `translations`:

```typescript
// Add to en object:
analysis: "Analysis",
keyTakeaways: "Key Takeaways",
actionItems: "Next Steps",

// Add to ko object:
analysis: "분석",
keyTakeaways: "핵심 요약",
actionItems: "다음 단계",
```

- [ ] **Step 2: Add Analysis section after the hero recommendation**

In `src/components/SummaryCard.tsx`, after the hero recommendation `<div>` (the `rounded-2xl border-l-4` block ending around line 128) and before the Key Reasons section, add:

```tsx
        {/* Analysis */}
        {result.analysis && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {t.analysis}
            </h3>
            <p className="px-3.5 py-2 text-sm leading-relaxed" style={{ color: 'var(--summary-secondary-text)' }}>
              {result.analysis}
            </p>
          </div>
        )}
```

- [ ] **Step 3: Add Key Takeaways section after Key Reasons**

After the Key Reasons section (after the closing `)}` around line 146), add:

```tsx
        {/* Key Takeaways */}
        {result.keyTakeaways && result.keyTakeaways.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.keyTakeaways}
            </h3>
            <div className="space-y-1">
              {result.keyTakeaways.map((item, i) => {
                const dashIdx = item.indexOf(" - ")
                const hasLabel = dashIdx > 0 && dashIdx < 40
                return (
                  <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm leading-snug" style={{ color: 'var(--summary-secondary-text)' }}>
                    <span className="text-theme-accent mt-0.5 text-sm leading-none shrink-0">•</span>
                    <span>
                      {hasLabel ? (
                        <>
                          <strong style={{ color: 'var(--summary-main-text)' }}>{item.slice(0, dashIdx)}</strong>
                          {item.slice(dashIdx)}
                        </>
                      ) : item}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
```

- [ ] **Step 4: Add Action Items section after Minority View**

After the Minority View section (after its closing `)}` around line 160), add:

```tsx
        {/* Action Items */}
        {result.actionItems && result.actionItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-theme-accent flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.actionItems}
            </h3>
            <div className="space-y-1">
              {result.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3.5 py-2 rounded-lg text-sm leading-snug" style={{ color: 'var(--summary-secondary-text)' }}>
                  <span className="text-theme-accent mt-0.5 text-xs font-bold leading-none shrink-0">{i + 1}.</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 5: Update copy handler to include new fields**

In the `handleCopy` function, update the text array to include new sections when present:

```typescript
  const handleCopy = () => {
    const lines = [
      t.recommendation,
      result.recommendedAnswer,
      "",
      `${t.voteSplit}: ${result.voteSplit}`,
      `${t.confidence}: ${result.confidence}%`,
    ]
    if (result.analysis) {
      lines.push("", `${t.analysis}:`, result.analysis)
    }
    lines.push("", `${t.reasons}:`, ...result.reasons.map((r) => `  - ${r}`))
    if (result.keyTakeaways && result.keyTakeaways.length > 0) {
      lines.push("", `${t.keyTakeaways}:`, ...result.keyTakeaways.map((r) => `  - ${r}`))
    }
    if (result.actionItems && result.actionItems.length > 0) {
      lines.push("", `${t.actionItems}:`, ...result.actionItems.map((r, i) => `  ${i + 1}. ${r}`))
    }
    lines.push("", `${t.minorityView}: ${result.minorityView}`, `${t.oppositeCase}: ${result.oppositeCase}`)
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }
```

- [ ] **Step 6: Verify build and test visually**

Run: `npx next build --no-lint 2>&1 | head -20`
Expected: No errors. Then test locally with `npm run dev` - run a debate with each response length and verify the summary card scales appropriately.

- [ ] **Step 7: Commit**

```bash
git add src/components/SummaryCard.tsx
git commit -m "feat: render structured verdict sections (analysis, takeaways, action items)"
```

---

### Task 6: Add collapsible AI responses in ChatBubble

**Files:**
- Modify: `src/components/ChatBubble.tsx`

- [ ] **Step 1: Add responseLength prop and collapse state**

In `src/components/ChatBubble.tsx`, update the component props to accept `responseLength`:

```typescript
import { useState, useRef, useEffect } from "react"
import { Message, Provider, Locale, ResponseLength } from "@/types"
```

Update the component signature:

```typescript
export default function ChatBubble({
  message,
  isTyping,
  locale = "en",
  responseLength = "short",
  onNewDiscussion,
}: {
  message: Message
  isTyping?: boolean
  locale?: Locale
  responseLength?: ResponseLength
  onNewDiscussion?: () => void
}) {
```

- [ ] **Step 2: Add collapse/expand logic for AI messages**

Inside the component, before the `if (message.sender === "system")` check, add:

```typescript
  const [expanded, setExpanded] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const isAI = !["user", "system", "verdict"].includes(message.sender)
  const shouldCollapse = isAI && responseLength !== "short" && !isTyping && !expanded

  useEffect(() => {
    if (isAI && responseLength !== "short" && contentRef.current && message.content) {
      const el = contentRef.current
      setIsOverflowing(el.scrollHeight > el.clientHeight + 4)
    }
  }, [message.content, isAI, responseLength])
```

- [ ] **Step 3: Update the AI message content rendering**

Replace the content `<div>` (the one with key="content", lines 157-174) with a version that supports collapse:

```tsx
          <div className="relative">
            <div
              key="content"
              ref={isAI ? contentRef : undefined}
              className={cn(
                "px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed shadow-sm break-words whitespace-pre-wrap transition-all duration-200",
                isUser
                  ? "bg-[var(--user-bubble)] text-[var(--user-bubble-foreground)] rounded-tr-sm"
                  : cn(
                      "border rounded-tl-sm text-zinc-800 dark:text-zinc-200",
                      modelBorders[message.sender] ?? "border-zinc-200 dark:border-zinc-800",
                      modelBackgrounds[message.sender] ?? "bg-zinc-50 dark:bg-zinc-900/50"
                    )
              )}
              style={shouldCollapse ? { maxHeight: "6em", overflow: "hidden" } : undefined}
            >
              {message.content}
              {isTyping && (
                <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-current animate-pulse" />
              )}
            </div>
            {/* Fade overlay + expand button */}
            {shouldCollapse && isOverflowing && (
              <div
                className="absolute bottom-0 left-0 right-0 h-10 rounded-b-2xl flex items-end justify-center pb-1 cursor-pointer"
                style={{
                  background: "linear-gradient(transparent, var(--background))",
                }}
                onClick={() => setExpanded(true)}
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">
                  ...
                </span>
              </div>
            )}
            {isAI && expanded && isOverflowing && (
              <button
                onClick={() => setExpanded(false)}
                className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors px-4"
              >
                Show less
              </button>
            )}
          </div>
```

- [ ] **Step 4: Pass responseLength from ChatThread**

Find where `ChatBubble` is used. In `src/components/ChatThread.tsx`, find the `<ChatBubble` call and add the `responseLength` prop. Read the file first to find the exact location.

The ChatThread component needs to accept and pass `responseLength`. Add it to ChatThread's props:

```typescript
responseLength?: ResponseLength
```

And pass it to ChatBubble:

```tsx
<ChatBubble ... responseLength={responseLength} />
```

Then in `src/app/chat/page.tsx`, pass `responseLength` to `<ChatThread>`:

```tsx
<ChatThread ... responseLength={responseLength} />
```

- [ ] **Step 5: Verify build and test visually**

Run: `npx next build --no-lint 2>&1 | head -20`
Expected: No errors. Then test with medium/long responses - AI messages should collapse to ~first paragraph height with "..." at bottom. Short mode should show full responses.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatBubble.tsx src/components/ChatThread.tsx src/app/chat/page.tsx
git commit -m "feat: collapsible AI responses for medium/long mode with expand/collapse"
```

---

### Task 7: Add rounds dropdown to Header

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/chat/page.tsx` (if onChangeRounds not already passed)

- [ ] **Step 1: Add onChangeRounds prop and rounds dropdown state**

In `src/components/Header.tsx`, add to the props interface:

```typescript
  onChangeRounds: (rounds: number) => void
```

Add state for the dropdown:

```typescript
  const [showRoundsDropdown, setShowRoundsDropdown] = useState(false)
```

Add rounds translations to the `translations` object:

```typescript
// en:
rounds: "Rounds",
roundsTooltip: "Set discussion rounds",

// ko:
rounds: "라운드",
roundsTooltip: "토론 라운드 설정",
```

- [ ] **Step 2: Close rounds dropdown on outside click**

In the `handleClickOutside` function, add `setShowRoundsDropdown(false)`.
In the `handleBlur` function, add `setShowRoundsDropdown(false)`.

- [ ] **Step 3: Replace the read-only round counter with a dropdown**

Replace the round counter `<div>` (lines 158-171, the `relative group shrink-0` div containing the round display) with a dropdown matching the response length pattern:

```tsx
          <div className={cn("relative shrink-0 group", isDebating && "pointer-events-none opacity-40")} data-header-dropdown>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowRoundsDropdown(!showRoundsDropdown)}
              aria-haspopup="listbox"
              aria-expanded={showRoundsDropdown}
              className="flex items-center gap-1 sm:gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <RotateCw className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500" />
              <span className="text-[11px] sm:text-xs font-medium text-zinc-600 dark:text-zinc-400">
                <span className="hidden sm:inline">{t.rounds} </span>{maxRounds}
              </span>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-400 dark:text-zinc-500 opacity-50" />
            </motion.button>

            <div className={cn(
              "absolute top-full mt-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-medium rounded pointer-events-none transition-opacity delay-100 whitespace-nowrap z-50 shadow-sm hidden sm:block",
              showRoundsDropdown ? "opacity-0" : "opacity-0 group-hover:opacity-100"
            )}>
              {t.roundsTooltip}
            </div>

            <AnimatePresence>
              {showRoundsDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute top-full left-0 mt-1 w-28 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-[60] py-1"
                >
                  {[1, 2, 3, 5].map((rounds) => (
                    <motion.button
                      key={rounds}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onChangeRounds(rounds)
                        setShowRoundsDropdown(false)
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                        maxRounds === rounds
                          ? "font-medium text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-600 dark:text-zinc-400"
                      )}
                    >
                      {rounds} {t.rounds}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Round progress indicator */}
          <span className="text-[9px] font-mono font-bold text-zinc-400 dark:text-zinc-500">
            {currentRound}/{maxRounds}
          </span>
```

Also add `RotateCw` to the lucide-react imports at the top of the file.

- [ ] **Step 4: Pass onChangeRounds from chat page**

In `src/app/chat/page.tsx`, find the `<ChatHeader` usage. It already receives `maxRounds`. Add `onChangeRounds` prop:

```tsx
onChangeRounds={(rounds: number) => {
  setMaxRounds(rounds)
  localStorage.setItem("quorum_rounds", String(rounds))
}}
```

Read the file first to confirm the exact prop names and state setter used.

- [ ] **Step 5: Verify build and test**

Run: `npx next build --no-lint 2>&1 | head -20`
Expected: No errors. Test that rounds dropdown appears next to response length, is disabled during debate, and persists selection.

- [ ] **Step 6: Commit**

```bash
git add src/components/Header.tsx src/app/chat/page.tsx
git commit -m "feat: add rounds dropdown to header next to response length"
```

---

### Task 8: Remove rounds from SettingsModal

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Remove the Discussion Rounds section**

In `src/components/SettingsModal.tsx`, remove the entire rounds section in the preferences tab (lines 246-273). This is the block starting with:

```tsx
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1"><RotateCw ...
```

and ending with its closing `</div>`.

Also remove `maxRounds`, `onChangeRounds` from the component props interface since they're no longer needed in the modal. Remove the `RotateCw` import if it's no longer used elsewhere in the file.

Clean up translations: remove `discussionRounds`, `rounds`, `rounds1Desc`, `rounds2Desc`, `rounds3Desc`, `rounds5Desc` from both `en` and `ko` translation objects.

- [ ] **Step 2: Update chat/page.tsx to stop passing rounds props to SettingsModal**

In `src/app/chat/page.tsx`, find the `<SettingsModal` usage and remove the `maxRounds` and `onChangeRounds` props.

- [ ] **Step 3: Verify build**

Run: `npx next build --no-lint 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsModal.tsx src/app/chat/page.tsx
git commit -m "refactor: remove rounds from settings modal (now in header)"
```

---

### Task 9: Manual QA and final verification

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Visual QA checklist**

Run `npm run dev` and test:

1. **Short mode**: Run a debate with short response length. Summary card should be concise (no analysis/takeaways/actionItems sections). AI responses show full content, no collapse.
2. **Medium mode**: Summary card shows keyTakeaways with bold labels. AI responses collapse to first paragraph with "..." expander. Clicking expands, "Show less" collapses.
3. **Long mode**: Summary card shows analysis paragraph, keyTakeaways, actionItems numbered list. AI responses collapse same as medium.
4. **Rounds dropdown**: Appears in header next to response length. Disabled during debate. Persists to localStorage.
5. **Settings modal**: No rounds section. Theme, models, language still work.
6. **Old threads**: Load an existing thread - should render without errors (new fields are optional/undefined).

- [ ] **Step 3: Commit any fixes**

If any issues found during QA, fix and commit.
