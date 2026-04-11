import "dotenv/config"
import { queryGemini } from "./gemini"
import { queryPerplexity } from "./perplexity"
import type { Message } from "@/types"

const testMessage: Message = {
  id: "test-1",
  sender: "user",
  displayName: "Eddie",
  content: "Hello! Introduce yourself in one sentence.",
  timestamp: new Date(),
}

async function testProviders() {
  console.log("=== Testing Quorum Provider Wrappers ===\n")

  // Test Gemini
  console.log("🔵 Testing Gemini (gemini-2.5-pro)...")
  try {
    const geminiResponse = await queryGemini(
      "You are a helpful assistant. Respond briefly.",
      [testMessage]
    )
    console.log("✅ Gemini response:", geminiResponse)
  } catch (error) {
    console.error("❌ Gemini failed:", (error as Error).message)
  }

  console.log("")

  // Test Perplexity
  console.log("🟢 Testing Perplexity (sonar-pro)...")
  try {
    const perplexityResponse = await queryPerplexity(
      "You are a helpful assistant. Respond briefly.",
      [testMessage]
    )
    console.log("✅ Perplexity response:", perplexityResponse)
  } catch (error) {
    console.error("❌ Perplexity failed:", (error as Error).message)
  }

  console.log("\n=== Tests Complete ===")
}

testProviders()
