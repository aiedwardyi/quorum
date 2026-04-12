# Single-Page Merge: Homepage + Chat

## Problem

Users experience a jarring disconnect between the homepage (setup) and chat page (active debate). Controls relocate, the input box teleports, and the overall layout shifts dramatically. Users describe it as navigating "2 sites."

## Solution

Merge both pages into a single component at `/` with two phases: `setup` and `active`. Shared elements animate between positions using Framer Motion `layoutId`, so users see continuity rather than a page swap.

## Phases

### Setup Phase (first visit, no active thread)

Renders current homepage layout:
- Centered textarea input with animated border
- 2x2 model selection cards below
- Response length + rounds selectors below that
- Header: logo, thread dropdown, locale/theme toggles, auth

### Transition (on submit)

1. Model cards shrink to compact pills, float up to header row (0.4s ease-out)
2. Settings controls (response length, rounds) fade out (accessible via header dropdowns)
3. Input box slides from vertical center to bottom-pinned (0.3s ease-out)
4. Chat messages appear above input, pushing empty space upward
5. ConsensusMeter fades in above input
6. Round counter appears in header next to model pills

### Active Phase (debate in progress or completed)

Renders current chat page layout:
- Header with model pills, round counter, stop/new debate buttons
- Scrollable message thread (flex-1)
- Bottom: ConsensusMeter + MessageInput

### State Transitions

```
Fresh visit to /          -> setup
Submit prompt             -> active (animated)
?thread=xxx               -> active (instant, no animation)
New debate (from active)  -> stays active, clears thread
Browser refresh (no thread) -> setup
```

## Architecture

### Single Component: `src/app/page.tsx`

```typescript
type Phase = "setup" | "active"

// Phase determined by:
// - Has active thread or pending prompt? -> "active"
// - ?thread=xxx in URL? -> "active"
// - Otherwise -> "setup"
```

### Key Changes

1. **Replace `src/app/chat/page.tsx` chat logic with a redirect stub** -- all chat UI/state logic moves to the root page, but the route file remains for backwards compatibility
2. **Remove sessionStorage bridge** -- no more `quorum_config` passing between pages; state lives in the component
3. **Redirect `/chat` to `/`** -- preserve old links by keeping `src/app/chat/page.tsx` as a minimal redirect
4. **useDebateEngine** -- called unconditionally in root page, used in active phase
5. **useThreadPersistence** -- same, called unconditionally
6. **Thread URL** -- change from `/chat?thread=xxx` to `/?thread=xxx`

### Animated Elements (Framer Motion layoutId)

| Element | Setup Position | Active Position | layoutId |
|---------|---------------|-----------------|----------|
| Input box | Centered, large | Bottom, full-width | `"main-input"` |
| Model indicators | 2x2 card grid | Header pill row | `"model-{id}"` per model |
| Send button | Inside input | Inside input | `"send-btn"` |

### Elements That Don't Animate

| Element | Setup | Active |
|---------|-------|--------|
| Response length | Visible toggle row | Header dropdown |
| Rounds | Visible toggle row | Header dropdown |
| Chat thread | Not rendered | Fills flex-1 space |
| ConsensusMeter | Not rendered | Above input |

These use `AnimatePresence` fade in/out rather than layout animation.

## Routing

- `/` -- the single page (setup or active based on state)
- `/?thread=xxx` -- loads existing thread directly into active phase
- `/chat` -- redirects to `/` (backwards compat)
- `/chat?thread=xxx` -- redirects to `/?thread=xxx`

## Edge Cases

1. **Login gate**: Still intercepts on setup phase before transitioning to active
2. **Back button during debate**: History guard stays, but navigates within `/` rather than back to homepage
3. **Direct link to thread**: Skip setup, render active immediately (no animation)
4. **Refresh during active debate**: If thread is saved, reload into active via `?thread=xxx`; if unsaved, fall back to setup
5. **File attachments**: Work identically in setup phase input

## What Stays the Same

- All API routes unchanged
- useDebateEngine hook unchanged
- useThreadPersistence hook unchanged
- ChatThread, ChatBubble, MessageInput, ConsensusMeter components unchanged
- SettingsModal unchanged
- Auth flow unchanged
- Theme system unchanged

## Dependencies

- `framer-motion` (already installed for existing animations)

## Success Criteria

- User submits prompt and sees smooth transition, no page flash
- All existing chat functionality works (streaming, rounds, verdict, persistence)
- Thread links work via `/?thread=xxx`
- Old `/chat` URLs redirect properly
- Mobile responsive in both phases
