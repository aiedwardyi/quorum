export function requireUserKeys(): boolean {
  return process.env.REQUIRE_USER_API_KEYS === "true"
}
