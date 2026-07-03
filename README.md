# Quorum

**Multi-AI decision assistant powered by model debate**

Replaces the manual workflow of copy-pasting between AI tabs. Instead of switching between Gemini, Perplexity, ChatGPT, and Claude to get multiple perspectives - just ask once and let them talk it out.

**[Try it live](https://main.d30ss3zib1fsu2.amplifyapp.com/)** - bring your own key, no sign-in.

[![CI](https://github.com/aiedwardyi/quorum/actions/workflows/ci.yml/badge.svg)](https://github.com/aiedwardyi/quorum/actions/workflows/ci.yml)
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

Each model sees what the others said, debates across rounds, and then Quorum returns a decisive recommendation rather than a neutral recap.

---

## Product Direction

Quorum started as a multi-AI group chat for consensus. It is now a decision tool:

- The verdict card leads with a recommended answer, not a neutral recap.
- It shows the vote split, key reasons, the strongest minority objection, and when the opposite case is worth taking.
- Continue the same thread after the verdict instead of resetting.
- Signed-in users get saved threads and history, similar to ChatGPT or Claude.

It feels less like "here's what everyone said" and more like "here's what you should do, and why."

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
      <img alt="Tokyo" src="https://img.shields.io/badge/Tokyo-7AA2F7?style=flat-square&labelColor=1A1B26&color=7AA2F7" />
    </td>
    <td align="center">
      <img src="docs/assets/theme-lovelace.png" alt="Quorum Lovelace theme" width="356" /><br />
      <img alt="Rosé" src="https://img.shields.io/badge/Rosé-C792EA?style=flat-square&labelColor=1F2335&color=C792EA" />
    </td>
  </tr>
</table>

---

## Quick Start

Quorum is **BYOK-first (bring your own key)**: paste your own provider API keys and go. No account, no database, no sign-in. Keys are stored only in your browser.

Prefer not to install? **[Try the hosted demo](https://main.d30ss3zib1fsu2.amplifyapp.com/)** and paste your keys there. To run it locally:

```bash
git clone https://github.com/aiedwardyi/quorum.git
cd quorum
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000), open **Settings**, and paste an API key for any provider you want on the panel. That is the whole setup.

> The consensus verdict and document OCR always run on **Gemini**, so add a Gemini key even if your panel is Claude/GPT/Perplexity only.

Set `REQUIRE_USER_API_KEYS=true` (recommended for any BYOK or public deploy) so a keyless request returns a clear "add your key" prompt instead of a generic provider error. Anonymous BYOK gives you an in-session thread; sign in (below) to save history across visits.

---

## Self-Hosting with Accounts (optional)

Sign-in is an optional upgrade: saved, encrypted provider keys and thread history synced to a database. Skip this entire section for pure BYOK.

Create a `.env.local` from [`.env.example`](./.env.example):

```bash
cp .env.example .env.local        # PowerShell: Copy-Item .env.example .env.local
```

```env
# Enable accounts: sign-in UI + the server-side session key lookup.
# Build-time inlined - rebuild after changing.
NEXT_PUBLIC_AUTH_ENABLED=true
REQUIRE_USER_API_KEYS=true

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host/neondb?sslmode=require

# Auth (NextAuth v5 + Google OAuth)
AUTH_SECRET=generate_with_openssl_rand_-base64_32
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret

# Encryption for accounts' saved provider keys
KEY_ENCRYPTION_SECRET=generate_with_openssl_rand_-base64_32

# Optional server-side provider keys (used only when REQUIRE_USER_API_KEYS is false)
GEMINI_API_KEY=your_gemini_api_key
PERPLEXITY_API_KEY=your_perplexity_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key
```

> **Important:** Prefer `.env.local` for local secrets. It takes precedence over `.env` and is gitignored by default.

For Google login, create a Google OAuth client and add this authorized redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

Gemini has two server-side auth paths (only relevant when serving your own keys):

- Google AI Studio API key: set `GEMINI_API_KEY`.
- Vertex AI ADC: leave `GEMINI_API_KEY` empty, set `VERTEX_PROJECT_ID` and `VERTEX_LOCATION`, then `gcloud auth application-default login`.

Then migrate the database and run:

```bash
npx prisma migrate dev
npm run dev
```

---

## Privacy & Security

- Your keys live only in your browser's `localStorage` and are sent to the server solely to call the model you picked. They are never persisted or logged server-side.
- Signed-in users' saved keys are encrypted at rest, scoped per account, and never travel back to the client.
- Browser BYOK is inherently exposed to XSS: any script running on the page can read `localStorage`. Use your own revocable keys, and self-hosters should serve a strict Content-Security-Policy.

---

## Tech Stack

| Layer     | Technology                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Framework | Next.js 16, React 19, TypeScript 5                                                                              |
| Styling   | Tailwind CSS 4, shadcn/ui, Framer Motion                                                                        |
| AI Models | Gemini 2.5 Flash/Pro (Google AI Studio or Vertex AI), Perplexity Sonar Pro, Claude (Anthropic), GPT-4o (OpenAI) |
| Database  | PostgreSQL on Neon, Prisma 7                                                                                    |
| Auth      | NextAuth v5 + Google OAuth                                                                                      |
| Streaming | Server-Sent Events (SSE)                                                                                        |
| i18n      | English / Korean                                                                                                |
| Themes    | Light, Solar, Dark, Tokyo, Rosé, Gruvbox, Mocha, Nord                                                          |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for details.

| Phase   | Focus                                                     | Status      |
| ------- | --------------------------------------------------------- | ----------- |
| **Phase 1** | Core group chat - Gemini + Perplexity                 | Done        |
| **Phase 2** | Claude + GPT, decisive verdict, continue-thread, 8 themes | Done    |
| **Phase 3** | Persistence, OAuth, thread history, BYOK backend      | Done        |
| **Phase 4** | Share verdicts, decision workflows, custom models     | Future      |

## License

MIT. See [LICENSE](./LICENSE) for full terms.
