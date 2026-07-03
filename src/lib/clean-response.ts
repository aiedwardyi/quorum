/** Sanitizes model output for chat rendering: citations, headings, truncation junk. */

// Fence boundary per CommonMark: up to 3 leading spaces before the backticks.
const FENCE_LINE = /^[ \t]{0,3}```/

/** Applies transform to every line outside ```-fenced blocks; fence interiors
 *  stay byte-for-byte intact (a `# comment` in bash is code, not a heading). */
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

/** Demotes # / ## headings to ### so model drift never renders page-scale
 *  headers in a bubble. Idempotent, fence-aware, runs per streaming chunk. */
export function sanitizeHeadings(text: string): string {
  return mapLinesOutsideFences(text, (line) => line.replace(/^#{1,2}(?=\s|$)/, "###"))
}

/** Strips leading #s for the streaming plain-text view so hashes never flash
 *  before ReactMarkdown settles. `(?:[ \t]+|$)` (not `\s+`): must catch bare
 *  "###" at a chunk boundary and CommonMark's empty-heading "###\n". */
export function stripHeadingMarkersForPlainText(text: string): string {
  return mapLinesOutsideFences(text, (line) => line.replace(/^#{1,6}(?:[ \t]+|$)/, ""))
}

/** Offsets of pattern matches on lines outside code fences, in document order. */
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

/** Streaming view only: deletes an unclosed trailing ** or ` marker (just the
 *  marker - slicing to end-of-string made text appear in bursts and broke
 *  scroll-follow). Single * stays: bullets and mid-word uses false-positive.
 *  Fenced code is excluded so `x**2` stays literal. */
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

// Trailing "(62 words)" / "(Word count: 75)" / "(75단어)" only - a bare "(75)"
// never matches, so years and footnotes survive.
const TRAILING_WORD_COUNT =
  /\s*\(\s*(?:word[-\s]*count\s*[:：]?\s*\d+\s*(?:words?|단어)?|\d+\s*(?:words?|단어))\s*\)\s*$/i

// Strips citations, trailing reference blocks, HTML entities/tags, and escaped
// control junk; demotes out-of-spec headings; drops word-count echoes.
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
