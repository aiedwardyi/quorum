import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("write-env", () => {
  it("writes REQUIRE_USER_API_KEYS when present in the build environment", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "quorum-write-env-"))
    const scriptPath = join(process.cwd(), "scripts", "write-env.js")

    try {
      execFileSync(process.execPath, [scriptPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          REQUIRE_USER_API_KEYS: "true",
        },
      })

      expect(readFileSync(join(tempDir, ".env"), "utf8")).toContain("REQUIRE_USER_API_KEYS='true'")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("writes NEXT_PUBLIC_AUTH_ENABLED when present in the build environment", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "quorum-write-env-"))
    const scriptPath = join(process.cwd(), "scripts", "write-env.js")

    try {
      execFileSync(process.execPath, [scriptPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          NEXT_PUBLIC_AUTH_ENABLED: "true",
        },
      })

      expect(readFileSync(join(tempDir, ".env"), "utf8")).toContain(
        "NEXT_PUBLIC_AUTH_ENABLED='true'"
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("writes ACCESS_CODES when present in the build environment", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "quorum-write-env-"))
    const scriptPath = join(process.cwd(), "scripts", "write-env.js")

    try {
      execFileSync(process.execPath, [scriptPath], {
        cwd: tempDir,
        env: {
          ...process.env,
          ACCESS_CODES: "code-one,code-two",
        },
      })

      expect(readFileSync(join(tempDir, ".env"), "utf8")).toContain(
        "ACCESS_CODES='code-one,code-two'"
      )
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
