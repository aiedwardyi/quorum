/** TTFT benchmark for model candidates. Usage: npx tsx scripts/model-speed.ts <claude|gpt|gemini> [runs] */
import { readFileSync } from "node:fs"
import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { VertexAI } from "@google-cloud/vertexai"
import { buildUserContent } from "../src/lib/providers/claude"
import { loadGoogleApplicationCredentialsJson } from "../src/lib/google-credentials"
import { redactSecrets } from "../src/lib/redact-secrets"
import type { Message } from "../src/types"

const TIMEOUT_MS = 60_000
const MAX_TOKENS = 1024

for (const file of [".env", ".env.local"]) {
  let text = ""
  try {
    text = readFileSync(file, "utf8")
  } catch {
    continue
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2")
  }
}

const SYSTEM_PROMPT = `CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in English. Every sentence, every bullet, every summary line must be in English.

You are NAME in a group discussion with other AI models and a human user.
Your name is NAME. Always speak as yourself in first person.
Do NOT introduce yourself or state your name. Jump straight into the topic.
NEVER speak as another model. NEVER prefix your response with any name like "[Gemini]:" or "[Claude]:".
This is the opening pass. Answer the user's question independently from your own judgment. You do not see the other models' takes. Do not recap anyone else. Do not wait for consensus. Take a position.
The human is the decision-maker. Respond to the full conversation naturally.
If you disagree with another model, say so directly and explain why.
Do NOT include citations, references, footnotes, URLs, or source numbers like [1][2] in your response.
NEVER give a lazy one-sentence answer. Even in short mode, provide a substantive response with reasoning.
This platform delivers informational perspectives on consequential topics. Always provide a substantive informational answer from your viewpoint.
Do NOT roleplay as the user or quote what the user said. Only respond as yourself.
Do NOT include a word count, character count, or any meta-annotation in your response.`

const MESSAGES: Message[] = [
  {
    id: "1",
    sender: "user",
    displayName: "You",
    content:
      "I'm a solo founder building a B2B invoicing SaaS. Should I start with a monolith or microservices, and what would make you change that answer later?",
  } as Message,
]

const THREAD = `Here is the discussion so far:\n\n${MESSAGES.map((m) => `[${m.displayName}]: ${m.content}`).join("\n\n")}\n\nPlease respond to the discussion above.`

type Sample = { ttft: number; total: number; thoughtTokens: number; chars: number }
type Candidate = {
  label: string
  run: (name: string, signal: AbortSignal) => Promise<Sample>
}

function system(name: string) {
  return SYSTEM_PROMPT.replaceAll("NAME", name)
}

function claude(model: string, extra: Record<string, unknown>): Candidate["run"] {
  return async (name, signal) => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const t0 = Date.now()
    let ttft = -1
    let chars = 0
    let thinkingBlocks = 0
    const stream = await client.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        system: system(name),
        messages: [{ role: "user", content: buildUserContent(MESSAGES) }],
        stream: true,
        ...extra,
      } as Anthropic.MessageCreateParamsStreaming,
      { signal }
    )
    for await (const ev of stream) {
      if (ev.type === "content_block_start" && ev.content_block.type === "thinking") {
        thinkingBlocks++
      }
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta" && ev.delta.text) {
        if (ttft < 0) ttft = Date.now() - t0
        chars += ev.delta.text.length
      }
    }
    return { ttft, total: Date.now() - t0, thoughtTokens: thinkingBlocks, chars }
  }
}

function gpt(model: string, extra: Record<string, unknown>): Candidate["run"] {
  return async (name, signal) => {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const t0 = Date.now()
    let ttft = -1
    let chars = 0
    let reasoning = 0
    const stream = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: system(name) },
          { role: "user", content: THREAD },
        ],
        stream: true,
        stream_options: { include_usage: true },
        ...extra,
      } as OpenAI.Chat.ChatCompletionCreateParamsStreaming,
      { signal }
    )
    for await (const chunk of stream) {
      const text = chunk.choices?.[0]?.delta?.content
      if (text) {
        if (ttft < 0) ttft = Date.now() - t0
        chars += text.length
      }
      reasoning = chunk.usage?.completion_tokens_details?.reasoning_tokens ?? reasoning
    }
    return { ttft, total: Date.now() - t0, thoughtTokens: reasoning, chars }
  }
}

function gemini(model: string, extra: Record<string, unknown>): Candidate["run"] {
  return async (name, signal) => {
    const credentials = loadGoogleApplicationCredentialsJson()
    const vertex = new VertexAI({
      project: process.env.VERTEX_PROJECT_ID!,
      location: process.env.VERTEX_LOCATION!,
      ...(credentials ? { googleAuthOptions: { credentials } } : {}),
    })
    const m = vertex.getGenerativeModel({ model })
    const t0 = Date.now()
    let ttft = -1
    let chars = 0
    const result = await m.generateContentStream({
      systemInstruction: { role: "system", parts: [{ text: system(name) }] },
      contents: [{ role: "user", parts: [{ text: THREAD }] }],
      generationConfig: { maxOutputTokens: MAX_TOKENS, ...extra } as never,
    })
    for await (const chunk of result.stream) {
      if (signal.aborted) throw new Error("timeout")
      const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        if (ttft < 0) ttft = Date.now() - t0
        chars += text.length
      }
    }
    const usage = (await result.response).usageMetadata as
      | { thoughtsTokenCount?: number }
      | undefined
    return { ttft, total: Date.now() - t0, thoughtTokens: usage?.thoughtsTokenCount ?? 0, chars }
  }
}

const SLOTS: Record<string, { name: string; candidates: Candidate[] }> = {
  claude: {
    name: "Claude",
    candidates: [
      { label: "claude-sonnet-4-6 (current)", run: claude("claude-sonnet-4-6", {}) },
      {
        label: "claude-haiku-5-5 thinking off",
        run: claude("claude-haiku-5-5", {
          thinking: { type: "disabled" },
          output_config: { effort: "low" },
        }),
      },
      {
        label: "claude-sonnet-5-5 thinking off",
        run: claude("claude-sonnet-5-5", {
          thinking: { type: "between_tools" },
          output_config: { effort: "low" },
        }),
      },
    ],
  },
  gpt: {
    name: "GPT",
    candidates: [
      { label: "gpt-4o (current)", run: gpt("gpt-4o", { max_tokens: MAX_TOKENS }) },
      {
        label: "gpt-6-luna reasoning none",
        run: gpt("gpt-6-luna", { max_completion_tokens: MAX_TOKENS, reasoning_effort: "none" }),
      },
    ],
  },
  gemini: {
    name: "Gemini",
    candidates: [
      { label: "gemini-2.5-flash (current)", run: gemini("gemini-2.5-flash", {}) },
      {
        label: "gemini-3.8-flash thinking minimal",
        run: gemini("gemini-3.8-flash", { thinkingConfig: { thinkingLevel: "MINIMAL" } }),
      },
    ],
  },
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function timed(c: Candidate, name: string): Promise<Sample | string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await c.run(name, ctl.signal)
  } catch (e) {
    return redactSecrets(String((e as Error).message)).slice(0, 300)
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const slotKey = process.argv[2]
  const runs = Number(process.argv[3] ?? 5)
  const slot = SLOTS[slotKey]
  if (!slot) throw new Error(`slot must be one of: ${Object.keys(SLOTS).join(", ")}`)

  const results = new Map<string, Sample[]>()
  const errors = new Map<string, string>()
  const live = new Set<string>()

  for (const c of slot.candidates) {
    const warm = await timed(c, slot.name)
    if (typeof warm === "string") {
      errors.set(c.label, warm)
      console.log(`${c.label}: warmup FAILED: ${warm}`)
    } else {
      live.add(c.label)
      results.set(c.label, [])
      console.log(`${c.label}: warmup ok ttft=${warm.ttft}ms thought=${warm.thoughtTokens}`)
    }
  }

  for (let i = 0; i < runs; i++) {
    for (const c of slot.candidates) {
      if (!live.has(c.label)) continue
      const r = await timed(c, slot.name)
      if (typeof r === "string") {
        console.log(`run ${i + 1} ${c.label}: ERR ${r}`)
        continue
      }
      results.get(c.label)!.push(r)
      console.log(
        `run ${i + 1} ${c.label}: ttft=${r.ttft}ms total=${r.total}ms thought=${r.thoughtTokens} chars=${r.chars}`
      )
    }
  }

  console.log("\n| model | median TTFT | worst TTFT | median total | thought |")
  console.log("|---|---|---|---|---|")
  for (const c of slot.candidates) {
    const s = results.get(c.label)
    if (!s || s.length === 0) {
      console.log(`| ${c.label} | FAILED | - | - | ${errors.get(c.label) ?? "-"} |`)
      continue
    }
    const ttfts = s.map((x) => x.ttft)
    console.log(
      `| ${c.label} | ${median(ttfts)}ms | ${Math.max(...ttfts)}ms | ${median(s.map((x) => x.total))}ms | ${Math.max(...s.map((x) => x.thoughtTokens))} |`
    )
  }
}

main().catch((e) => {
  console.error(redactSecrets(String(e?.message ?? e)))
  process.exit(1)
})
