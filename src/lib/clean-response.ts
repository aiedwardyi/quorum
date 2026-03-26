// Strips citation markers [1], [2][3], and trailing "Refs:" / "References:" blocks
// that AI models sometimes include despite being told not to.
export function cleanResponse(text: string): string {
  return text
    // Remove inline citation markers like [1], [2][3], [1][4][5]
    .replace(/\[\d+\](\[\d+\])*/g, "")
    // Remove trailing "Refs:", "References:", "--- Refs:" blocks and everything after
    .replace(/\n*-{0,3}\s*(Refs?|References|Sources)\s*:[\s\S]*$/i, "")
    // Clean up any double spaces left behind
    .replace(/  +/g, " ")
    .trim()
}
