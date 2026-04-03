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
    content += `${key}=${process.env[key]}\n`
  }
}

fs.writeFileSync(".env.production", content)
console.log(`Wrote ${keys.filter(k => process.env[k]).length} env vars to .env.production`)
