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
 */
export function stripHeadingMarkersForPlainText(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, "")
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

// Strips citation markers [1], [2][3], trailing "Refs:" / "References:" blocks,
// HTML entities, stray tags, and escaped control sequences that Perplexity and
// other models sometimes include in responses. Also demotes out-of-spec `#`
// / `##` headings to `###` via sanitizeHeadings.
export function cleanResponse(text: string): string {
  return sanitizeHeadings(text)
    // Remove inline citation markers like [1], [2][3], [1][2] - only numeric/short refs
    .replace(/\[\d+\](\[\d+\])*/g, "")
    // Remove trailing "Refs:", "References:", "Sources:" blocks and everything after
    .replace(/\n*-{0,3}\s*(Refs?|References|Sources)\s*:[\s\S]*$/i, "")
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
