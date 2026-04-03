const fs = require("fs")

const keys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "NEXTAUTH_URL",
  "VERTEX_PROJECT_ID",
  "VERTEX_LOCATION",
  "PERPLEXITY_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
]

let content = ""
for (const key of keys) {
  if (process.env[key]) {
    // Quote values to handle special chars (JSON, URLs with passwords, etc.)
    const escaped = process.env[key].replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    content += `${key}="${escaped}"\n`
  }
}

// Write to .env so Next.js loads it at both build and runtime
fs.writeFileSync(".env", content)
console.log(`Wrote ${keys.filter(k => process.env[k]).length} env vars to .env`)
