import { describe, expect, it } from "vitest"
import { requireUserKeys } from "@/lib/deploy-config"

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
