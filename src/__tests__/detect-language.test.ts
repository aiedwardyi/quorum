import { describe, it, expect } from "vitest"
import { isPredominantlyKorean } from "@/lib/detect-language"

const rx = "처방전 (환자 보관용)\n푸른숲내과의원\n아목시실린 500mg 1일 3회 7일분\n식후 30분 복용"
const msg = (content: string) => ({ content })

describe("isPredominantlyKorean", () => {
  it("answers an English request about a Korean file in English", () => {
    expect(
      isPredominantlyKorean([
        msg(`translate this for me\n\n--- File: pasted-image-1.png ---\n${rx}`),
      ])
    ).toBe(false)
  })

  it("answers a Korean request about an English file in Korean", () => {
    const doc =
      "Claim denied. CARC 50: these are non-covered services because this is not deemed a medical necessity by the payer."
    expect(isPredominantlyKorean([msg(`이거 요약해줘\n\n--- File: eob.pdf ---\n${doc}`)])).toBe(
      true
    )
  })

  it("follows a Korean file when nothing was typed", () => {
    expect(isPredominantlyKorean([msg(`--- File: rx.jpg ---\n${rx}`)])).toBe(true)
  })

  it("follows the file when the typed text is too short to tell", () => {
    expect(isPredominantlyKorean([msg(`ok\n\n--- File: rx.jpg ---\n${rx}`)])).toBe(true)
  })

  it("uses later typed turns in the same chat", () => {
    expect(
      isPredominantlyKorean([msg(`--- File: rx.jpg ---\n${rx}`), msg("now in English please")])
    ).toBe(false)
  })

  it("keeps plain messages as before", () => {
    expect(isPredominantlyKorean([msg("감기약 같이 먹어도 되나요?")])).toBe(true)
    expect(isPredominantlyKorean([msg("Can I take these together?")])).toBe(false)
    expect(isPredominantlyKorean([])).toBe(false)
  })
})
