# PR 3: Response Quality & Settings

## Overview

Address user feedback items #2, #3, #6, #7, #10 from Round 1 law firm testers. Four changes: structured summary card scaled to response length, collapsible AI responses, round selector in header, settings deduplication.

## 1. Structured Summary Card (#2, #10)

### Problem

Users chose "long" response length but the summary/verdict card was still short (15-word recommendation + brief bullets). They expected the summary to scale with the setting. They referenced Gemini-style structured responses as the ideal format.

### Design

Expand `VerdictResult` with new optional fields:

```typescript
type VerdictResult = {
  // existing
  recommendedAnswer: string
  voteSplit: string
  confidence: number
  reasons: string[]
  minorityView: string
  oppositeCase: string
  modelAgreement?: number
  // new
  analysis?: string        // detailed breakdown paragraph
  keyTakeaways?: string[]  // bold-labeled bullet points (e.g. "Type safety - catches bugs early...")
  actionItems?: string[]   // numbered next steps
}
```

Verdict prompt changes by response length:

- **Short**: Current behavior. Punchy recommendation (max 15 words), 2-3 short reasons, brief minority view.
- **Medium**: Remove 15-word cap on recommendation. Add `keyTakeaways` (3-4 labeled bullets with 1-2 sentence detail each). Longer `reasons`. No `actionItems`.
- **Long**: Full output. `analysis` paragraph (3-5 sentences synthesizing the debate), `keyTakeaways` (4-5 detailed bullets), `actionItems` (2-4 concrete next steps), detailed `minorityView`.

`SummaryCard.tsx` renders new sections conditionally -- if a field is undefined or empty, the section is skipped. This keeps backwards compatibility with existing saved threads.

### Files

- `src/types.ts` - add optional fields to VerdictResult
- `src/lib/verdict-prompt.ts` - response-length-aware prompt generation
- `src/lib/validate-verdict.ts` - accept new optional fields in validation
- `src/components/SummaryCard.tsx` - render new sections
- `src/app/api/consensus/route.ts` - pass responseLength to prompt builder

## 2. Collapsible AI Responses (#3)

### Problem

Long AI responses create a wall of text. Users want full-length content available but don't want to scroll past it all.

### Design

In `ChatBubble.tsx`, for AI messages when response length is medium or long:

- Render full content in the DOM
- Collapse to first paragraph height by default using CSS `max-height` + `overflow: hidden`
- Show a gradient fade-out overlay at the bottom of collapsed content
- Show a "..." or "Show more" button below the fade
- Click toggles to full height with smooth CSS transition
- Each bubble manages its own expanded/collapsed state via local `useState`
- Short mode: no collapse behavior (responses are already short)

Detection: measure whether content exceeds a threshold (~4 lines / ~100px). If it doesn't, don't show the expander even on medium/long mode.

### Files

- `src/components/ChatBubble.tsx` - collapse/expand logic and UI

## 3. Round Selector in Header (#6)

### Problem

Response length is changeable in the header but rounds are not. Users found this inconsistent.

### Design

Add a rounds dropdown in the chat header, next to the existing response length dropdown:

- Same styling pattern as response length (small select element)
- Options: 1, 2, 3, 5 (matching settings modal values)
- Disabled during active debate (pointer-events-none, opacity reduction)
- Uses existing `onRoundsChange` callback from chat page

### Files

- `src/components/Header.tsx` - add rounds dropdown
- `src/app/chat/page.tsx` - thread props for rounds change handler (if not already passed)

## 4. Settings Consolidation (#7)

### Problem

Settings split between header and settings modal is confusing.

### Design

Header quick-access controls (things you change mid-session):
- Response length dropdown
- Rounds dropdown (new)
- Theme cycle button

Settings modal (less frequent changes):
- Theme grid (full selector)
- Model toggles
- Language toggle
- API keys
- Remove rounds selector from modal (now in header, avoid duplication)

### Files

- `src/components/SettingsModal.tsx` - remove rounds section

## Implementation Order

1. Types + verdict prompt changes (foundation)
2. Summary card UI (depends on 1)
3. Collapsible AI responses (independent)
4. Header round selector + settings modal cleanup (independent)

Steps 3 and 4 can be done in parallel since they touch different components.

## Backwards Compatibility

- Existing saved threads have no `analysis`/`keyTakeaways`/`actionItems` in verdict data. The new fields are optional, so old threads render exactly as before.
- No database schema changes needed -- verdict data is stored as JSON.
