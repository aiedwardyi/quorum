/** Image vs OCR-text A/B through the real provider streams. Usage: npx tsx scripts/vision-speed.ts <image.jpg> [runs] [--think] [--smoke] [--seat gpt] */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename } from "node:path"
import { streamClaude } from "../src/lib/providers/claude"
import { streamGPT } from "../src/lib/providers/gpt"
import { streamPerplexity } from "../src/lib/providers/perplexity"
import {
  GEMINI_MODEL,
  GEMINI_NO_THINKING,
  geminiAnswerText,
  geminiUsage,
  getVertexModel,
  streamGemini,
  vertexThinking,
  withGeminiFallback,
} from "../src/lib/providers/gemini"
import { capImages, geminiParts, withTextOnlyRetry } from "../src/lib/image-parts"
import { getVerdictPrompt } from "../src/lib/verdict-prompt"
import { usageCents, type ModelUsage, type UsageSink } from "../src/lib/host-cost"
import { redactSecrets } from "../src/lib/redact-secrets"
import type { Message } from "../src/types"

const TIMEOUT_MS = 60_000
// Medium length, as the app defaults: 2048 tokens, clamped at 170 words by the chat route.
const MAX_TOKENS = 2048
const WORD_LIMIT = 170
const QUESTION = "translate this into English"

for (const file of [".env", ".env.local"]) {
  let text = ""
  try {
    text = readFileSync(file, "utf8")
  } catch {
    continue
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2")
  }
}

const SYSTEM_PROMPT = `CRITICAL LANGUAGE REQUIREMENT: You MUST respond ENTIRELY in English.

You are NAME in a group discussion with other AI models and a human user.
Your name is NAME. Always speak as yourself in first person.
Do NOT introduce yourself or state your name. Jump straight into the topic.
This is the opening pass. Answer the user's question independently from your own judgment. Take a position.
Be concise. Target 120 words, hard cap at 170 words, do not exceed.
Never invent facts, names, drug names, codes, or criteria.
Do NOT include citations, references, footnotes, URLs, or source numbers like [1][2] in your response.
When the user's message includes document text (between "--- File:" markers), that content HAS ALREADY BEEN EXTRACTED and is part of the message - read and analyze it directly.`

type Seat = "gemini" | "claude" | "gpt" | "perplexity"
const SEATS: Record<Seat, { name: string; fn: typeof streamGPT }> = {
  gemini: { name: "Gemini", fn: streamGemini },
  claude: { name: "Claude", fn: streamClaude },
  gpt: { name: "GPT", fn: streamGPT },
  perplexity: { name: "Perplexity", fn: streamPerplexity },
}

const seatArg = process.argv[process.argv.indexOf("--seat") + 1]
const ONLY = process.argv.includes("--seat") ? (seatArg as Seat) : undefined

type Sample = { ttft: number; total: number; cents: number; text: string; retried: boolean }

async function ocrText(imagePath: string, data: string): Promise<string> {
  const sidecar = `${imagePath}.ocr.txt`
  if (existsSync(sidecar)) return readFileSync(sidecar, "utf8")
  const res = await getVertexModel(GEMINI_MODEL).generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { text: "You are an OCR engine. Output ONLY the raw text in this image, verbatim." },
          { inlineData: { mimeType: "image/jpeg", data } },
        ],
      },
    ],
    generationConfig: { temperature: 0, ...GEMINI_NO_THINKING },
  })
  const text = geminiAnswerText(res.response.candidates?.[0]?.content?.parts).trim()
  writeFileSync(sidecar, text)
  return text
}

async function runSeat(seat: Seat, messages: Message[], thinkHard: boolean): Promise<Sample> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  let ttft = -1
  let text = ""
  let usage: ModelUsage | undefined
  let retried = false
  const sink: UsageSink = (u) => {
    usage = u
  }
  const warn = console.warn
  console.warn = (...args: unknown[]) => {
    if (String(args[0]).includes("retrying text-only")) retried = true
    warn(...args)
  }
  try {
    const { name, fn } = SEATS[seat]
    const stream = withTextOnlyRetry(
      (sent) =>
        fn(
          SYSTEM_PROMPT.replaceAll("NAME", name),
          sent,
          ctl.signal,
          MAX_TOKENS,
          "",
          thinkHard,
          sink
        ),
      capImages(messages),
      seat,
      ctl.signal
    )
    for await (const chunk of stream) {
      if (ttft < 0) ttft = Date.now() - t0
      text += chunk
      if (text.split(/\s+/).filter(Boolean).length > WORD_LIMIT) {
        ctl.abort()
        break
      }
    }
    return { ttft, total: Date.now() - t0, cents: usage ? usageCents(usage) : 0, text, retried }
  } finally {
    console.warn = warn
    clearTimeout(timer)
  }
}

async function runVerdict(question: string, replies: Message[], images: Message["images"]) {
  const t0 = Date.now()
  let cents = 0
  const thread = [`[You]: ${question}`, ...replies.map((m) => `[${m.displayName}]: ${m.content}`)]
  const prompt = `Here is the discussion to analyze:\n\n${thread.join("\n\n")}\n\n${replies.length} model(s) produced a real reply. voteSplit denominator MUST be ${replies.length}.`
  const parts = geminiParts([{ text: prompt }, ...(images ?? []).map((image) => ({ image }))])
  const text = await withGeminiFallback(
    async (modelName) => {
      const res = await getVertexModel(modelName).generateContent({
        systemInstruction: { role: "system", parts: [{ text: getVerdictPrompt("en", "medium") }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          ...vertexThinking(modelName, false),
        },
      })
      const usage = geminiUsage(res.response.usageMetadata, modelName)
      if (usage) cents += usageCents(usage)
      return geminiAnswerText(res.response.candidates?.[0]?.content?.parts)
    },
    12_000,
    "verdict"
  )
  return { ttft: -1, total: Date.now() - t0, cents, text, retried: false }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function question(
  arm: "A" | "B",
  base: Message,
  image: Message["images"],
  thinkHard: boolean
) {
  const user: Message = arm === "B" ? { ...base, images: image } : base
  const seats = ONLY ? [ONLY] : (Object.keys(SEATS) as Seat[])
  const results = await Promise.all(
    seats.map((s) =>
      runSeat(s, [user], thinkHard).catch((e) => redactSecrets(String(e?.message ?? e)))
    )
  )
  const out: Partial<Record<Seat | "verdict", Sample | string>> = {}
  const replies: Message[] = []
  seats.forEach((s, i) => {
    out[s] = results[i]
    const r = results[i]
    if (typeof r !== "string" && r.text.trim())
      replies.push({ ...base, sender: s, displayName: SEATS[s].name, content: r.text })
  })
  if (!thinkHard && !ONLY) {
    out.verdict = await runVerdict(QUESTION, replies, arm === "B" ? image : undefined).catch((e) =>
      redactSecrets(String(e?.message ?? e))
    )
  }
  return out
}

async function main() {
  const imagePath = process.argv[2]
  const runs = Number(process.argv.find((a, i) => i > 2 && /^\d+$/.test(a)) ?? 5)
  const thinkHard = process.argv.includes("--think")
  const smoke = process.argv.includes("--smoke") || thinkHard
  if (!imagePath)
    throw new Error("usage: vision-speed.ts <image.jpg> [runs] [--think] [--smoke] [--seat gpt]")

  const data = readFileSync(imagePath).toString("base64")
  const name = basename(imagePath)
  const ocr = await ocrText(imagePath, data)
  const image = [{ name, data }]
  const base: Message = {
    id: "u1",
    sender: "user",
    displayName: "You",
    content: `${QUESTION}\n\n--- File: ${name} ---\n${ocr || "[Image with no readable text]"}`,
    timestamp: new Date(),
  }
  console.log(`image ${name}: ${data.length} base64 chars, OCR ${ocr.length} chars`)

  if (smoke) {
    const out = await question("B", base, image, thinkHard)
    for (const [k, r] of Object.entries(out)) {
      if (typeof r === "string") console.log(`${k}: FAILED ${r}`)
      else
        console.log(
          `${k}: ${r.retried ? "TEXT-ONLY RETRY" : "ok"} total=${r.total}ms ${r.cents.toFixed(3)}c\n  ${r.text.slice(0, 300).replace(/\n/g, " ")}`
        )
    }
    return
  }

  const keys = ONLY ? [ONLY] : [...(Object.keys(SEATS) as Seat[]), "verdict" as const]
  const samples = { A: new Map<string, Sample[]>(), B: new Map<string, Sample[]>() }
  const cost = { A: [] as number[], B: [] as number[] }
  for (let i = 0; i < runs; i++) {
    for (const arm of i % 2 ? (["B", "A"] as const) : (["A", "B"] as const)) {
      const out = await question(arm, base, image, false)
      let cents = 0
      for (const k of keys) {
        const r = out[k]
        if (typeof r === "string" || !r) {
          console.log(`run ${i + 1} ${arm} ${k}: ERR ${r}`)
          continue
        }
        cents += r.cents
        samples[arm].set(k, [...(samples[arm].get(k) ?? []), r])
        console.log(
          `run ${i + 1} ${arm} ${k}: ttft=${r.ttft}ms total=${r.total}ms ${r.cents.toFixed(3)}c${r.retried ? " RETRIED" : ""}`
        )
      }
      cost[arm].push(cents)
    }
  }

  console.log("\n| seat | A TTFT | B TTFT | A total | B total | limit | pass |")
  console.log("|---|---|---|---|---|---|---|")
  for (const k of keys) {
    const a = samples.A.get(k) ?? []
    const b = samples.B.get(k) ?? []
    if (!a.length || !b.length) {
      console.log(`| ${k} | - | - | - | - | - | FAIL (errors) |`)
      continue
    }
    const at = median(a.map((s) => s.total))
    const bt = median(b.map((s) => s.total))
    const limit = k === "verdict" ? at + 1000 : Math.max(at * 1.1, at + 1000)
    const ttft = (xs: Sample[]) => (k === "verdict" ? "-" : `${median(xs.map((s) => s.ttft))}ms`)
    console.log(
      `| ${k} | ${ttft(a)} | ${ttft(b)} | ${at}ms | ${bt}ms | ${Math.round(limit)}ms | ${bt <= limit ? "PASS" : "FAIL"} |`
    )
  }
  console.log(
    `\ncost per question (median): A ${median(cost.A).toFixed(3)}c, B ${median(cost.B).toFixed(3)}c`
  )
}

main().catch((e) => {
  console.error(redactSecrets(String(e?.message ?? e)))
  process.exit(1)
})
