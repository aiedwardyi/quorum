import { describe, expect, it } from "vitest"
import { seoulDay } from "@/lib/seoul-day"

describe("seoul day", () => {
  it("rolls over at 00:00 Seoul, which is 15:00 UTC", () => {
    expect(seoulDay(new Date("2026-10-24T14:59:59.999Z"))).toBe("2026-10-24")
    expect(seoulDay(new Date("2026-10-24T15:00:00.000Z"))).toBe("2026-10-25")
  })

  it("keeps the UTC date from 00:00 to 14:59 UTC", () => {
    expect(seoulDay(new Date("2026-10-24T00:00:00.000Z"))).toBe("2026-10-24")
  })
})
