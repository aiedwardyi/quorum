/** Whether this deploy has host credentials for a provider. */
import type { Provider } from "@/types"
import { getConfiguredGeminiApiKey } from "@/lib/providers/gemini"

const PLACEHOLDER_PROJECT_ID = "your_google_cloud_project_id"

function hasRealVertexProject(): boolean {
  const projectId = process.env.VERTEX_PROJECT_ID?.trim()
  return Boolean(projectId && projectId !== PLACEHOLDER_PROJECT_ID)
}

export function hasServerCreds(provider: Provider): boolean {
  switch (provider) {
    case "gemini":
      return Boolean(getConfiguredGeminiApiKey() || hasRealVertexProject())
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
    default:
      return false
  }
}
