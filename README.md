<div align="center">

# 🏛️ Quorum

**Multi-AI group chat for consensus**

Ask a question. AI models discuss it with each other.
You steer the conversation. They converge on an answer.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Perplexity](https://img.shields.io/badge/Perplexity-Sonar_Pro-14B8A6)](https://docs.perplexity.ai/)

---

</div>

## What It Does

Replaces the manual workflow of copy-pasting between AI tabs. Instead of switching between Gemini, Perplexity, ChatGPT, and Claude to get multiple perspectives — just ask once and let them talk it out.
```
You:         "Should I file this patent as provisional or non-provisional?"

Gemini 🔵:   "Provisional gives you 12 months to refine claims..."
Perplexity 🟢: "I'd push back — if claims are well-defined, go direct..."
Gemini 🔵:   "Fair point on fees, but the risk is..."
You:         "What about cost? I have a limited budget."
Perplexity 🟢: "Given budget constraints, I'm revising my position..."

✅ Consensus reached: 85%
```

## Quick Start
```bash
# Clone and install
git clone https://github.com/aiedwardyi/quorum.git
cd quorum
npm install

# Authenticate with Google Cloud (for Gemini)
gcloud auth application-default login

# Add your Perplexity key to .env
# Then run
npm run dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+, TypeScript, App Router |
| Styling | Tailwind CSS + shadcn/ui |
| AI Models | Gemini 2.5 Flash (Vertex AI), Perplexity Sonar Pro |
| Streaming | Server-Sent Events (SSE) |
| State | React useState / useReducer |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full plan.

| Version | Focus | Status |
|---------|-------|--------|
| **v1** | Working group chat (Gemini + Perplexity) | 🔨 In Progress |
| **v2** | More models + persistence | 📋 Planned |
| **v3** | i18n + BYOK + polish | 📋 Planned |
| **v4** | Power features | 💭 Future |

## License

Proprietary — Copyright (c) 2026 Edward Yi. All rights reserved.
