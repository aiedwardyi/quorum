const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-proj-[A-Za-z0-9_-]+/g, "sk-proj-***"],
  [/sk-[A-Za-z0-9_-]{20,}/g, "sk-***"],
  [/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***"],
  [/AIza[0-9A-Za-z_-]{20,}/g, "AIza***"],
  [/pplx-[A-Za-z0-9_-]{20,}/g, "pplx-***"],
  [/sk_(?:live|test)_[0-9A-Za-z]{12,}/g, "sk_***"],
  [/rk_live_[0-9A-Za-z]{12,}/g, "rk_live_***"],
  [/whsec_[0-9A-Za-z]{12,}/g, "whsec_***"],
  [/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh_***"],
  [/github_pat_[A-Za-z0-9_]+/g, "github_pat_***"],
]

export function redactSecrets(value: string): string {
  return SECRET_PATTERNS.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    value
  )
}
