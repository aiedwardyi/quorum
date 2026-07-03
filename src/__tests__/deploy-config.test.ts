import { describe, expect, it } from "vitest"
import { authEnabled, requireUserKeys } from "@/lib/deploy-config"

describe("requireUserKeys", () => {
  it("is enabled only when REQUIRE_USER_API_KEYS is exactly true", () => {
    const previous = process.env.REQUIRE_USER_API_KEYS
    try {
      process.env.REQUIRE_USER_API_KEYS = "true"
      expect(requireUserKeys()).toBe(true)

      process.env.REQUIRE_USER_API_KEYS = "TRUE"
      expect(requireUserKeys()).toBe(false)

      delete process.env.REQUIRE_USER_API_KEYS
      expect(requireUserKeys()).toBe(false)
    } finally {
      if (previous === undefined) {
        delete process.env.REQUIRE_USER_API_KEYS
      } else {
        process.env.REQUIRE_USER_API_KEYS = previous
      }
    }
  })
})

describe("authEnabled", () => {
  it("is enabled only when NEXT_PUBLIC_AUTH_ENABLED is exactly true", () => {
    const previous = process.env.NEXT_PUBLIC_AUTH_ENABLED
    try {
      process.env.NEXT_PUBLIC_AUTH_ENABLED = "true"
      expect(authEnabled()).toBe(true)

      process.env.NEXT_PUBLIC_AUTH_ENABLED = "TRUE"
      expect(authEnabled()).toBe(false)

      delete process.env.NEXT_PUBLIC_AUTH_ENABLED
      expect(authEnabled()).toBe(false)
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_AUTH_ENABLED
      } else {
        process.env.NEXT_PUBLIC_AUTH_ENABLED = previous
      }
    }
  })
})
