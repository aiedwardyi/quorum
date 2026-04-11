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
