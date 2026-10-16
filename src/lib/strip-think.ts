/** Drops <think>...</think> reasoning from a token stream; tags may split across chunks. */
const OPEN = "<think>"
const CLOSE = "</think>"

function partialTagSuffix(text: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (tag.startsWith(text.slice(-n))) return n
  }
  return 0
}

export function createThinkStripper() {
  let buffer = ""
  let inThink = false

  return {
    push(chunk: string): string {
      buffer += chunk
      let out = ""
      while (buffer) {
        if (inThink) {
          const end = buffer.indexOf(CLOSE)
          if (end === -1) {
            buffer = buffer.slice(buffer.length - partialTagSuffix(buffer, CLOSE))
            return out
          }
          buffer = buffer.slice(end + CLOSE.length)
          inThink = false
          continue
        }
        const start = buffer.indexOf(OPEN)
        if (start === -1) {
          const hold = partialTagSuffix(buffer, OPEN)
          out += buffer.slice(0, buffer.length - hold)
          buffer = buffer.slice(buffer.length - hold)
          return out
        }
        out += buffer.slice(0, start)
        buffer = buffer.slice(start + OPEN.length)
        inThink = true
      }
      return out
    },
    // An unclosed <think> at stream end is all reasoning, so it yields nothing.
    flush(): string {
      const rest = inThink ? "" : buffer
      buffer = ""
      return rest
    },
  }
}
