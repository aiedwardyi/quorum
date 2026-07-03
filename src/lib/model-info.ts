/** Static display metadata for each AI provider - names and description strings. */
import type { Provider, Locale } from "@/types"

// Single source of truth for model display names and tooltip
// descriptions across the homepage hero, chat header toggles, and the
// settings modal. Update here, not in the UI components.
export const MODEL_INFO: Record<Provider, { name: string; description: Record<Locale, string> }> = {
  gemini: {
    name: "Gemini",
    description: {
      en: "Google's flagship multimodal AI model",
      ko: "Google의 최신 멀티모달 AI 모델",
    },
  },
  perplexity: {
    name: "Perplexity",
    description: {
      en: "AI search engine for up-to-date information",
      ko: "최신 정보를 제공하는 AI 검색 엔진",
    },
  },
  claude: {
    name: "Claude",
    description: {
      en: "Anthropic's advanced reasoning model",
      ko: "Anthropic의 고급 추론 모델",
    },
  },
  gpt: {
    name: "GPT",
    description: {
      en: "OpenAI's powerful language model",
      ko: "OpenAI의 강력한 언어 모델",
    },
  },
}
