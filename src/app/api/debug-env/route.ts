import { NextResponse } from "next/server"

// Temporary debug endpoint - remove after fixing auth
export async function GET() {
  const keys = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NEXTAUTH_URL",
    "AUTH_URL",
    "VERTEX_PROJECT_ID",
    "VERTEX_LOCATION",
    "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  ]

  const status: Record<string, string> = {}
  for (const key of keys) {
    const val = process.env[key]
    if (!val) {
      status[key] = "MISSING"
    } else if (key === "DATABASE_URL") {
      // Mask password in connection string
      status[key] = val.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")
    } else if (key === "AUTH_SECRET") {
      status[key] = `SET (${val.length} chars)`
    } else if (key === "GOOGLE_APPLICATION_CREDENTIALS_JSON") {
      status[key] = `SET (${val.length} chars, starts with ${val.substring(0, 10)})`
    } else {
      // Show first 8 chars only
      status[key] = `${val.substring(0, 8)}...`
    }
  }

  return NextResponse.json({ env: status, nodeEnv: process.env.NODE_ENV })
}
