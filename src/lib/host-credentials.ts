/** Whether this deploy has host credentials for a provider. */
import type { Provider } from "@/types"
import { getConfiguredGeminiApiKey } from "@/lib/providers/gemini"

export function hasServerCreds(provider: Provider): boolean {
  switch (provider) {
    case "gemini":
      return Boolean(getConfiguredGeminiApiKey() || process.env.VERTEX_PROJECT_ID?.trim())
    case "claude": {
      const k = process.env.ANTHROPIC_API_KEY?.trim()
      return Boolean(k && !k.startsWith("your_"))
    }
    case "gpt": {
      const k = process.env.OPENAI_API_KEY?.trim()
      return Boolean(k && !k.startsWith("your_"))
    }
    case "perplexity": {
      const k = process.env.PERPLEXITY_API_KEY?.trim()
      return Boolean(k && !k.startsWith("your_"))
    }
  }
}
