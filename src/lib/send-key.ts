/** Enter sends; Shift+Enter is a newline. Never send mid-IME composition. */
export function shouldSendOnKey(e: {
  key: string
  shiftKey: boolean
  isComposing: boolean
}): boolean {
  return e.key === "Enter" && !e.shiftKey && !e.isComposing
}
