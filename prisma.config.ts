import { defineConfig } from "prisma/config"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })
dotenv.config({ quiet: true })

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
})
