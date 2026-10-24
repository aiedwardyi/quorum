const FILE_HEADER = /^--- File: (.+) ---$/gm

export interface MessageAttachment {
  name: string
  text: string
}

/** Typed text and `--- File: <name> ---` blocks of a user message, for display only. */
export function splitAttachments(content: string): {
  text: string
  files: MessageAttachment[]
} {
  const headers = [...content.matchAll(FILE_HEADER)]
  if (headers.length === 0) return { text: content, files: [] }
  return {
    text: content.slice(0, headers[0].index).trim(),
    files: headers.map((h, i) => ({
      name: h[1],
      text: content.slice(h.index + h[0].length, headers[i + 1]?.index).trim(),
    })),
  }
}
