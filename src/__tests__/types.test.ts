import { describe, it, expect } from "vitest"
import { THEMES } from "@/types"

describe("THEMES constant", () => {
  it("contains expected theme values", () => {
    expect(THEMES).toContain("light")
    expect(THEMES).toContain("dark")
    expect(THEMES).toContain("solarized")
    expect(THEMES).toContain("tokyonight")
    expect(THEMES).toContain("lovelace")
    expect(THEMES).toContain("gruvbox")
    expect(THEMES).toContain("catppuccin")
    expect(THEMES).toContain("nord")
  })

  it("has exactly 8 themes", () => {
    expect(THEMES).toHaveLength(8)
  })

  it("has no duplicate values", () => {
    const unique = new Set(THEMES)
    expect(unique.size).toBe(THEMES.length)
  })
})
