/**
 * Records the pipeline demo as a high-quality GIF + smooth MP4.
 *
 * Uses Playwright video recording (WebM) then ffmpeg for conversion.
 * - GIF: two-pass palette encoding (10fps, <5MB)
 * - MP4: H.264 30fps, silky smooth for GitHub README embedding
 *
 * Usage: node docs/demo/record-gif.mjs
 * Requires: any static server exposing the repo root on localhost:49899
 */

import { chromium } from "playwright"
import { execSync } from "child_process"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const require = createRequire(import.meta.url)
const ffmpegPath = require("ffmpeg-static")

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const WIDTH = 800
const HEIGHT = 600
const DEMO_PATH = "/docs/demo/pipeline-demo-summary-polish.html"
const OUTPUT_GIF = path.resolve(__dirname, "..", "assets", "hero-demo.gif")
const OUTPUT_MP4 = path.resolve(__dirname, "..", "assets", "hero-demo.mp4")
const TEMP_DIR = path.resolve(__dirname, "..", "assets", "_temp_recording")

async function record() {
  // Clean up temp dir
  if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true })
  fs.mkdirSync(TEMP_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    recordVideo: {
      dir: TEMP_DIR,
      // Match the demo viewport exactly so the captured frames fill the canvas.
      size: { width: WIDTH, height: HEIGHT },
    },
  })

  const page = await context.newPage()

  await page.goto(`http://localhost:49899${DEMO_PATH}`, {
    waitUntil: "domcontentloaded",
  })

  console.log("Recording video...")

  // Wait for the demo to finish - the "done" step shows the replay button
  await page.waitForSelector("#replay-btn.visible", { timeout: 60000 })

  // Give a moment for final animations to settle
  await page.waitForTimeout(2000)

  // Close context to finalize the video file
  await context.close()
  await browser.close()

  // Find the recorded video file
  const files = fs.readdirSync(TEMP_DIR).filter((f) => f.endsWith(".webm"))
  if (files.length === 0) {
    throw new Error("No video file recorded")
  }
  const videoPath = path.join(TEMP_DIR, files[0])
  const palettePath = path.join(TEMP_DIR, "palette.png")

  console.log(`Video saved: ${videoPath}`)

  // --- MP4: smooth 30fps H.264 ---
  console.log("\n[1/2] Converting to MP4 (30fps, H.264)...")
  execSync(
    `"${ffmpegPath}" -y -i "${videoPath}" -vf "fps=30" -c:v libx264 -preset slow -crf 12 -pix_fmt yuv420p -movflags +faststart -an "${OUTPUT_MP4}"`,
    { stdio: "inherit" }
  )
  const mp4Stats = fs.statSync(OUTPUT_MP4)
  console.log(`MP4: ${OUTPUT_MP4} (${(mp4Stats.size / 1024 / 1024).toFixed(2)} MB)`)

  // --- GIF: two-pass palette, 10fps ---
  console.log("\n[2/2] Converting to GIF (10fps, two-pass palette)...")
  const gifFps = 10

  execSync(
    `"${ffmpegPath}" -y -i "${videoPath}" -vf "fps=${gifFps},scale=${WIDTH}:${HEIGHT}:flags=lanczos,palettegen=max_colors=256:stats_mode=diff" "${palettePath}"`,
    { stdio: "inherit" }
  )
  execSync(
    `"${ffmpegPath}" -y -i "${videoPath}" -i "${palettePath}" -lavfi "fps=${gifFps},scale=${WIDTH}:${HEIGHT}:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" "${OUTPUT_GIF}"`,
    { stdio: "inherit" }
  )

  const gifStats = fs.statSync(OUTPUT_GIF)
  const gifMB = (gifStats.size / 1024 / 1024).toFixed(2)
  console.log(`GIF: ${OUTPUT_GIF} (${gifMB} MB)`)

  // Clean up temp files
  fs.rmSync(TEMP_DIR, { recursive: true })
  console.log("Temp files cleaned up.")
}

record().catch((err) => {
  console.error("Recording failed:", err)
  process.exit(1)
})
