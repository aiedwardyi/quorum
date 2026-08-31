/** Vertex ADC JSON: dotenv truncation must be a real config error, not a silent empty. */
import { describe, expect, it } from "vitest"
import {
  VERTEX_CREDENTIALS_JSON_ERROR,
  extractEnvValue,
  parseServiceAccountJson,
  resolveGoogleApplicationCredentialsJson,
} from "@/lib/google-credentials"

const MULTILINE_JSON = `{
  "type": "service_account",
  "project_id": "demo-project",
  "private_key_id": "abc123",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----\\n",
  "client_email": "sa@demo-project.iam.gserviceaccount.com",
  "client_id": "1234567890",
  "token_uri": "https://oauth2.googleapis.com/token"
}`

describe("parseServiceAccountJson", () => {
  it("parses one-line JSON", () => {
    const parsed = parseServiceAccountJson(
      JSON.stringify({ type: "service_account", project_id: "p" })
    )
    expect(parsed.project_id).toBe("p")
  })

  it("parses multiline JSON", () => {
    const parsed = parseServiceAccountJson(MULTILINE_JSON)
    expect(parsed.type).toBe("service_account")
    expect(parsed.project_id).toBe("demo-project")
  })

  it("throws a secret-free error for dotenv-truncated '{'", () => {
    expect(() => parseServiceAccountJson("{")).toThrow(VERTEX_CREDENTIALS_JSON_ERROR)
    try {
      parseServiceAccountJson("{")
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).not.toMatch(/private_key/)
      expect(msg).not.toMatch(/BEGIN PRIVATE KEY/)
    }
  })
})

describe("extractEnvValue", () => {
  it("reads unquoted multiline JSON that Next dotenv would truncate to '{'", () => {
    const file = `VERTEX_PROJECT_ID=demo\nGOOGLE_APPLICATION_CREDENTIALS_JSON=${MULTILINE_JSON}\nVERTEX_LOCATION=us-central1\n`
    const extracted = extractEnvValue(file, "GOOGLE_APPLICATION_CREDENTIALS_JSON")
    expect(extracted).toBeDefined()
    const parsed = JSON.parse(extracted!)
    expect(parsed.project_id).toBe("demo-project")
    expect(parsed.client_email).toContain("iam.gserviceaccount.com")
  })

  it("reads single-quoted multiline JSON", () => {
    const file = `GOOGLE_APPLICATION_CREDENTIALS_JSON='${MULTILINE_JSON}'\n`
    const extracted = extractEnvValue(file, "GOOGLE_APPLICATION_CREDENTIALS_JSON")
    expect(JSON.parse(extracted!).project_id).toBe("demo-project")
  })
})

describe("resolveGoogleApplicationCredentialsJson", () => {
  it("recovers from .env.local when process.env only has '{'", () => {
    const file = `GOOGLE_APPLICATION_CREDENTIALS_JSON=${MULTILINE_JSON}\n`
    const resolved = resolveGoogleApplicationCredentialsJson("{", [file])
    expect(resolved?.project_id).toBe("demo-project")
  })

  it("throws the config error when the value is truncated and files do not recover it", () => {
    expect(() => resolveGoogleApplicationCredentialsJson("{", [])).toThrow(
      VERTEX_CREDENTIALS_JSON_ERROR
    )
  })

  it("returns undefined when the env var is absent", () => {
    expect(resolveGoogleApplicationCredentialsJson(undefined, [])).toBeUndefined()
    expect(resolveGoogleApplicationCredentialsJson("  ", [])).toBeUndefined()
  })
})
