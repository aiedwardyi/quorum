/**
 * Demotes `# Title` and `## Title` at line start to `### Title`. The app's
 * system prompt forbids `#` and `##` so they don't compete with the UI's
 * own headers, but models drift. Sanitizing client-side guarantees that
 * even an out-of-spec emission never renders as a page-scale h1/h2 in a
 * chat bubble, and the sanitizer runs per-chunk during streaming so the
 * hash chars never flash as plain text before ReactMarkdown catches them.
 *
 * The regex only matches `#` or `##` followed by whitespace, so `###+`
 * headings are untouched. Idempotent - running it on already-sanitized
 * text is a no-op. Chunk-boundary safe because it always runs on the
 * accumulated content.
 */
export function sanitizeHeadings(text: string): string {
  return text.replace(/^#{1,2}(?=\s)/gm, "###")
}

/**
 * Strips an unclosed trailing inline-markdown marker from a streaming view
 * of text, without touching the content after it. During smoothed streaming
 * the visible substring can end mid-pair like "Hello **wor" where the
 * closing `**` has not arrived yet. If we passed the raw substring to
 * ReactMarkdown it would render "**wor" literally, flashing asterisks until
 * the closing marker arrives. Instead we remove JUST the two characters of
 * the unclosed `**` (or one ` backtick), so the user sees "Hello wor" as
 * plain text while the word types in, and the moment the closing `**`
 * streams in, that word flips to bold without any character bursts.
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
 * Only for the streaming view - do not use on settled content.
 */
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
 * `$` in multiline mode matches end-of-line and end-of-string; `[ \t]+`
 * only consumes spaces/tabs so we do not eat the newline that separates
 * the heading line from the next paragraph.
 */
export function stripHeadingMarkersForPlainText(text: string): string {
  return text.replace(/^#{1,6}(?:[ \t]+|$)/gm, "")
}

export function trimUnclosedTrailingMarkdown(text: string): string {
  let out = text
  // Unclosed ** (bold). Count pairs; if odd, delete the last opening marker.
  const boldMatches = [...out.matchAll(/\*\*/g)]
  if (boldMatches.length % 2 === 1) {
    const lastOpen = boldMatches[boldMatches.length - 1]
    if (typeof lastOpen.index === "number") {
      out = out.slice(0, lastOpen.index) + out.slice(lastOpen.index + 2)
    }
  }
  // Unclosed ` (inline code). Same idea, single backtick.
  const tickMatches = [...out.matchAll(/`/g)]
  if (tickMatches.length % 2 === 1) {
    const lastOpen = tickMatches[tickMatches.length - 1]
    if (typeof lastOpen.index === "number") {
      out = out.slice(0, lastOpen.index) + out.slice(lastOpen.index + 1)
    }
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
  return sanitizeHeadings(text)
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
}
