/** Deploy-time feature flags read from environment variables. */
export function requireUserKeys(): boolean {
  return process.env.REQUIRE_USER_API_KEYS === "true"
}

export function authEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === "true"
}
