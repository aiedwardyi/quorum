# Quorum

**Multi-AI decision assistant powered by model debate**

Replaces the manual workflow of copy-pasting between AI tabs. Instead of switching between Gemini, Perplexity, ChatGPT, and Claude to get multiple perspectives - just ask once and let them talk it out.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google&logoColor=white)](https://cloud.google.com/vertex-ai)
[![Perplexity](https://img.shields.io/badge/Perplexity-Sonar_Pro-14B8A6)](https://docs.perplexity.ai/)
[![Claude](https://img.shields.io/badge/Claude-Anthropic-F97316?logo=anthropic&logoColor=white)](https://anthropic.com/)
[![GPT](https://img.shields.io/badge/GPT-OpenAI-10B981?logo=openai&logoColor=white)](https://openai.com/)

https://github.com/user-attachments/assets/b6e84e58-b5c8-4428-9fac-bdf0febc7ddd

---

## How It Works

```
You:           "Should we use microservices or a monolith for our MVP?"

Gemini:        "Start with a monolith. Microservices add deployment complexity too early."
Perplexity:    "Monolith for speed, but design with clean module boundaries from day one."
Claude:        "Agreed on monolith-first. The bigger startup risk is building too slowly."
GPT:           "Use a monolith until real scaling bottlenecks appear."

Quorum:        "Recommended answer: Start with a monolith for the MVP.
               It is faster to ship, easier to debug, and lower risk early on."

               Vote split: 4/4 models chose monolith
               Minority view: If independent teams must ship separately on day one,
               move toward services earlier.
```

Each model sees what the others said, debates across rounds, and then Quorum is moving toward returning a decisive recommendation, not just a neutral recap.

---

## Product Direction

Quorum started as a multi-AI group chat for consensus. The next product direction is narrower and more useful:

- Debate stays in the background.
- The final card should give a recommended answer first.
- The user should see vote split, key reasons, and the strongest minority objection.
- Users should be able to continue the same thread after the verdict instead of resetting.
- Logged-in users should have saved threads and history, similar to ChatGPT or Claude.

The goal is to feel less like "here's what everyone said" and more like "here's what you should do, and why."

---

## Themes

Switch instantly from the header or settings.

<table>
  <tr>
    <td align="center">
      <img src="docs/assets/theme-light.png" alt="Quorum light theme" width="356" /><br />
      <img alt="Light" src="https://img.shields.io/badge/Light-F8FAFC?style=flat-square&labelColor=E5E7EB&color=F8FAFC" />
    </td>
    <td align="center">
      <img src="docs/assets/theme-dark.png" alt="Quorum dark theme" width="356" /><br />
      <img alt="Dark" src="https://img.shields.io/badge/Dark-0B0B0F?style=flat-square&labelColor=111827&color=0B0B0F" />
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="docs/assets/theme-tokyonight.png" alt="Quorum Tokyo Night theme" width="356" /><br />
      <img alt="Tokyo Night" src="https://img.shields.io/badge/Tokyo_Night-7AA2F7?style=flat-square&labelColor=1A1B26&color=7AA2F7" />
    </td>
    <td align="center">
      <img src="docs/assets/theme-lovelace.png" alt="Quorum Lovelace theme" width="356" /><br />
      <img alt="Lovelace" src="https://img.shields.io/badge/Lovelace-C792EA?style=flat-square&labelColor=1F2335&color=C792EA" />
    </td>
  </tr>
</table>

---

## Quick Start

```bash
git clone https://github.com/aiedwardyi/quorum.git
cd quorum
npm install
```

Create a `.env.local` file from [`.env.example`](./.env.example):

```bash
cp .env.example .env.local
```

```powershell
Copy-Item .env.example .env.local
```

Fill in your credentials (see `.env.example` for all required variables):

```env
# Google Vertex AI
VERTEX_PROJECT_ID=your_google_cloud_project_id
VERTEX_LOCATION=us-central1

# Model Providers
PERPLEXITY_API_KEY=your_perplexity_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require

# Auth (NextAuth v5 + Google OAuth)
AUTH_SECRET=generate_with_openssl_rand_-base64_32
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

> **Important:** Use `.env.local`, not `.env` — Next.js only auto-loads `.env.local`.

Gemini uses Google Cloud Application Default Credentials:

```bash
gcloud auth application-default login
```

Push the Prisma schema to your database, then run:

```bash
npx prisma db push
npx prisma generate
npm run dev
```

Open [localhost:3000](http://localhost:3000) and start debating.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui, Framer Motion |
| AI Models | Gemini 2.5 Flash (Vertex AI), Perplexity Sonar Pro, Claude (Anthropic), GPT-4o (OpenAI) |
| Database | PostgreSQL on Neon, Prisma 7 |
| Auth | NextAuth v5 + Google OAuth |
| Streaming | Server-Sent Events (SSE) |
| i18n | English / Korean |
| Themes | Light, Dark, Tokyo Night, Lovelace, Gruvbox, Catppuccin, Nord, Solarized, Rose Pine |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for details.

| Version | Focus | Status |
|---------|-------|--------|
| **v1** | Core group chat - Gemini + Perplexity | Done |
| **v2** | Claude + GPT, decisive verdict, continue-thread, 9 themes | Done |
| **v3** | Persistence, OAuth, thread history | In Progress |
| **v4** | BYOK, share verdicts, monetization | Future |

## License

This project is proprietary software. Copyright (c) 2026 Edward Yi. All rights reserved.
Unauthorized copying, modification, or distribution is prohibited. See [LICENSE](./LICENSE) for full terms.
