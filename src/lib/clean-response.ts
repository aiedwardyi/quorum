/**
 * Fence-boundary detector used by every helper in this file that needs
 * to skip content inside triple-backtick fenced code blocks. CommonMark
 * allows 0-3 leading spaces of indentation before the opening/closing
 * fence, so the regex accepts the same.
 */
const FENCE_LINE = /^[ \t]{0,3}```/

/**
 * Walks `text` line-by-line, calls `transform(line)` on every line that
 * is NOT inside a triple-backtick fenced code block, and returns the
 * reassembled string with the transformed lines and all fence-interior
 * lines left byte-for-byte untouched. Preserves both `\n` and `\r\n`
 * separators so whitespace-pre-wrap rendering lands on the right line.
 *
 * Used by sanitizeHeadings and stripHeadingMarkersForPlainText so both
 * functions share the exact same fence-detection logic. A bash comment
 * `# /usr/bin/env bash` inside a fenced block is literal code, not a
 * markdown heading, and must survive every pass we make over the text.
 * trimUnclosedTrailingMarkdown uses collectMarkerIndicesOutsideFences
 * below for the same reason, but it needs marker offsets instead of a
 * line transform so it gets its own helper.
 */
function mapLinesOutsideFences(text: string, transform: (line: string) => string): string {
  const parts = text.split(/(\r?\n)/)
  let inFence = false
  for (let i = 0; i < parts.length; i += 2) {
    const line = parts[i]
    const isFenceBoundary = FENCE_LINE.test(line)
    if (!inFence && !isFenceBoundary) {
      parts[i] = transform(line)
    }
    if (isFenceBoundary) {
      inFence = !inFence
    }
  }
  return parts.join("")
}

/**
 * Demotes `# Title` and `## Title` at line start to `### Title`. The app's
 * system prompt forbids `#` and `##` so they don't compete with the UI's
 * own headers, but models drift. Sanitizing client-side guarantees that
 * even an out-of-spec emission never renders as a page-scale h1/h2 in a
 * chat bubble, and the sanitizer runs per-chunk during streaming so the
 * hash chars never flash as plain text before ReactMarkdown catches them.
 *
 * The regex only matches `#` or `##` followed by whitespace or end-of-
 * line, so `###+` headings are untouched. Idempotent - running it on
 * already-sanitized text is a no-op. Chunk-boundary safe because it
 * always runs on the accumulated content.
 *
 * Fence-aware: lines inside a triple-backtick fenced code block are
 * never rewritten. Long mode explicitly allows fenced code, and a bash
 * comment like `# /usr/bin/env bash` or `## Build steps` inside a fence
 * must stay literal - demoting it to `### ...` corrupts the code sample
 * both during streaming AND in the settled ReactMarkdown view.
 */
export function sanitizeHeadings(text: string): string {
  return mapLinesOutsideFences(text, (line) => line.replace(/^#{1,2}(?=\s|$)/, "###"))
}

/**
 * Strips leading heading markers (`### `, `#### `, etc.) from each line for
 * the streaming PLAIN-TEXT view. ReactMarkdown would render these as h3/h4
 * nodes once the bubble settles, but during streaming the bubble renders
 * the raw string and the hashes would show as literal characters. Stripping
 * the markers means the heading text types in as regular prose, and when
 * the bubble settles ReactMarkdown reparses the underlying content (which
 * still has the markers) and promotes it to the real heading element.
 *
 * We strip 1-6 hashes because sanitizeHeadings has already demoted `#`
 * and `##` to `###`, but a raw chunk may temporarily still contain
 * unsanitized forms depending on ordering.
 *
 * The tail alternation `(?:[ \t]+|$)` is critical. An earlier version
 * required `\s+` after the hashes, which missed two cases:
 *  1) The per-character streaming window where `displayedText` ends at
 *     exactly "###" with no trailing space yet - 1-3 frames per heading
 *     where the bare hashes flashed on screen.
 *  2) Lines where the heading content begins on the next line (`###\n...`)
 *     which CommonMark accepts as an empty h3 but our strip previously
 *     missed, so the hashes stayed visible until settle.
 * `[ \t]+` only consumes spaces/tabs so we do not eat newlines, and the
 * `$` alternative covers "bare hashes at end of line" like the
 * per-character streaming window and the "empty h3" CommonMark case.
 *
 * Fence-aware via mapLinesOutsideFences: shell comments, preprocessor
 * directives, or markdown-in-markdown examples inside code fences stay
 * literal during streaming (they would visibly "reappear" when
 * ReactMarkdown renders the fenced block verbatim at settle otherwise).
 */
export function stripHeadingMarkersForPlainText(text: string): string {
  return mapLinesOutsideFences(text, (line) => line.replace(/^#{1,6}(?:[ \t]+|$)/, ""))
}

/**
 * Collects global offsets of every match of `pattern` that occurs on a
 * line OUTSIDE a triple-backtick fenced code block. Fence detection uses
 * the same line-based walk as stripHeadingMarkersForPlainText (CommonMark
 * indented-fence rule, 0-3 leading spaces before the opening ```). Returns
 * the indices in document order so the caller can take the "last" entry
 * without having to re-sort.
 *
 * Used by trimUnclosedTrailingMarkdown to count only the markers that
 * would actually render as markdown at settle, so fenced code content
 * (where `**`, `` ` ``, `x**2`, `` `date` ``, etc. are literal code and
 * not markdown markers) stays byte-for-byte stable during streaming.
 */
function collectMarkerIndicesOutsideFences(text: string, marker: RegExp): number[] {
  const parts = text.split(/(\r?\n)/)
  const indices: number[] = []
  let inFence = false
  let offset = 0
  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]
    if (i % 2 === 0) {
      // Content line
      const isFenceBoundary = FENCE_LINE.test(segment)
      if (isFenceBoundary) {
        inFence = !inFence
      } else if (!inFence) {
        for (const match of segment.matchAll(marker)) {
          if (typeof match.index === "number") {
            indices.push(offset + match.index)
          }
        }
      }
    }
    offset += segment.length
  }
  return indices
}

/**
 * Strips an unclosed trailing inline-markdown marker from a streaming view
 * of text, without touching the content after it. During smoothed streaming
 * the visible substring can end mid-pair like "Hello **wor" where the
 * closing `**` has not arrived yet. Rendered as-is, the bubble would show
 * "Hello **wor" with the asterisks flashing as literal characters until
 * the closer arrives. Instead we remove JUST the two characters of the
 * unclosed `**` (or the single unclosed `` ` ``), so the user sees
 * "Hello wor" as plain text while the word types in, and the moment the
 * closing `**` streams in, that word flips to bold in the settled
 * ReactMarkdown render.
 *
 * Important: we DELETE only the marker itself, not the content that
 * follows. An earlier version sliced from the marker to end-of-string,
 * which hid every char after the opening `**` until the closer arrived,
 * and then revealed them all at once. That looked like a typing burst and
 * confused the scroll-follow effect because the bubble height jumped
 * non-monotonically.
 *
 * We intentionally do NOT trim single `*` (italic) because `*` shows up
 * as bullets and mid-word in ways that would create false positives.
 * Bold and inline code are the high-signal cases.
 *
 * Fenced code blocks (``` ```) are fully excluded from both the `**` and
 * backtick counts. Content inside a fence is literal code that the
 * settled ReactMarkdown render will display verbatim, so a Python
 * `x**2`, a shell `` `date` ``, or a JavaScript `**kwargs` comment inside
 * a fence must stay byte-for-byte stable during streaming. Without the
 * fence skip, the plain-text view would temporarily mutate code content
 * and then have the marker "reappear" the instant the bubble flips to
 * its settled render.
 *
 * Only for the streaming view - do not use on settled content.
 */
export function trimUnclosedTrailingMarkdown(text: string): string {
  let out = text
  // Unclosed ** (bold). Count pairs outside fenced code; if odd, delete
  // the last opening marker.
  const boldIndices = collectMarkerIndicesOutsideFences(out, /\*\*/g)
  if (boldIndices.length % 2 === 1) {
    const lastOpen = boldIndices[boldIndices.length - 1]
    out = out.slice(0, lastOpen) + out.slice(lastOpen + 2)
  }
  // Unclosed ` (inline code). Count single backticks outside fenced code;
  // if odd, delete the last opening marker. `collectMarkerIndicesOutsideFences`
  // already skips the fence markers themselves AND anything on a fenced
  // line, so we do not need the earlier fence-position filtering that
  // only handled triple-backtick sequences.
  const tickIndices = collectMarkerIndicesOutsideFences(out, /`/g)
  if (tickIndices.length % 2 === 1) {
    const lastOpen = tickIndices[tickIndices.length - 1]
    out = out.slice(0, lastOpen) + out.slice(lastOpen + 1)
  }
  return out
}

// Matches a trailing word-count annotation like "(62 words)",
// "(Word count: 75)", "(Word count: 398 words)", or Korean "(75단어)".
// Anchored to end-of-string and prefixed by optional whitespace so
// mid-text parentheticals are left alone. Two alternatives inside the
// parens: either a "Word count:" prefix (with optional units after the
// number) or a bare "<N> words" form - a lone "(75)" has neither prefix
// nor suffix and is never stripped, which avoids eating footnote
// numbers, years, or real parentheticals.
const TRAILING_WORD_COUNT =
  /\s*\(\s*(?:word[-\s]*count\s*[:：]?\s*\d+\s*(?:words?|단어)?|\d+\s*(?:words?|단어))\s*\)\s*$/i

// Strips citation markers [1], [2][3], trailing "Refs:" / "References:" blocks,
// HTML entities, stray tags, and escaped control sequences that Perplexity and
// other models sometimes include in responses. Also demotes out-of-spec `#`
// / `##` headings to `###` via sanitizeHeadings and drops trailing word-count
// meta-annotations ("(62 words)", "(Word count: 75)") that the models
// occasionally echo back from the response-length instruction.
export function cleanResponse(text: string): string {
  return (
    sanitizeHeadings(text)
      // Remove inline citation markers like [1], [2][3], [1][2] - only numeric/short refs
      .replace(/\[\d+\](\[\d+\])*/g, "")
      // Remove trailing "Refs:", "References:", "Sources:" blocks and everything after
      .replace(/\n*-{0,3}\s*(Refs?|References|Sources)\s*:[\s\S]*$/i, "")
      // Strip trailing "(N words)" / "(Word count: N)" meta-annotations.
      // Runs before the double-space collapse / trim so the regex's own
      // leading `\s*` can eat any preceding newlines cleanly.
      .replace(TRAILING_WORD_COUNT, "")
      // Remove markdown horizontal rules (--- or ***) that some models add
      .replace(/^\s*[-*]{3,}\s*$/gm, "")
      // Remove leftover HTML/XML tags
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      // Decode HTML entities (decode &amp; first to handle double-encoded like &amp;lt;)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      // Strip any tags that were entity-encoded (e.g. &lt;b&gt; -> <b>)
      .replace(/<\/?[a-zA-Z][^>]*>/g, "")
      // Remove escaped control sequences like \x08, \n08lt, etc.
      .replace(/\\[xX][0-9a-fA-F]{2}/g, "")
      .replace(/\\n[0-9]+[a-zA-Z]*/g, "")
      // Remove stray backslash-escaped fragments at end of text
      .replace(/\\[a-zA-Z]+\s*$/g, "")
      // Clean up any double spaces left behind
      .replace(/  +/g, " ")
      .trim()
  )
}
