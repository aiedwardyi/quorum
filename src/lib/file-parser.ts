/** Client-side PDF/DOCX/Excel/text extraction for AI prompts. */

import type { Provider } from "@/types"
import { parseNoKeyProviderFromResponse } from "@/lib/api-key-errors"
import { getClientKey } from "@/lib/client-api-keys"

const MAX_FILE_CHARS = 50000
const MAX_PDF_PAGES = 20
const MAX_FILE_SIZE_MB = 50
const MAX_OCR_PAGES = 10
const OCR_RENDER_SCALE = 2
// Below this a page reads as scanned/watermark-only; low enough to spare sparse-but-legit cover pages.
const WATERMARK_CHAR_THRESHOLD = 30
// This many image-paint ops = poster-style layout worth OCR even with extracted text; above the 1-2 logo baseline of normal docs.
const IMAGE_HEAVY_OPS_THRESHOLD = 4
// Sparse text + any image = image-driven page; 300 (was 100) covers Korean court watermark headers (~140-200 chars).
const SPARSE_TEXT_WITH_IMAGE_THRESHOLD = 300
// Text-dense pages skip image detection entirely - getOperatorList cannot flip the outcome.
const DENSE_TEXT_THRESHOLD = 2000
export const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "txt", "md", "csv"])

export type ParseWarning = "truncated" | "empty" | "too_large" | "parse_error"

export interface ParseResult {
  text: string
  warning?: ParseWarning
  usedOCR?: boolean
}

export interface ParseOptions {
  /** @param status - Human-readable status text
   *  @param progress - 0-100 percentage */
  onProgress?: (status: string, progress?: number) => void
  onApiKeyRequired?: (provider: Provider) => void
  /** Attach the browser gemini key to OCR only when signed-out (or auth off). */
  isAnonymous?: boolean
}

function joinPDFPages(pages: Array<string | null | undefined>): string {
  return pages
    .map((page) => page?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n")
}

export async function parseFile(file: File, options?: ParseOptions): Promise<ParseResult> {
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > MAX_FILE_SIZE_MB) {
    return { text: "", warning: "too_large" }
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""

  let result: string
  try {
    if (ext === "pdf") {
      const pdfResult = await parsePDF(file, options)
      if (pdfResult.usedOCR) {
        if (!pdfResult.text.trim()) return { text: "", warning: "empty", usedOCR: true }
        if (pdfResult.text.length > MAX_FILE_CHARS) {
          return {
            text: pdfResult.text.slice(0, MAX_FILE_CHARS) + "\n[...file truncated]",
            warning: "truncated",
            usedOCR: true,
          }
        }
        return { text: pdfResult.text, usedOCR: true }
      }
      result = pdfResult.text
    } else if (ext === "docx") result = await parseDOCX(file)
    else if (ext === "xlsx" || ext === "xls") result = await parseExcel(file)
    else if (ext === "txt" || ext === "md" || ext === "csv") result = await parseText(file)
    else return { text: `[Unsupported file type: ${file.name}]` }
  } catch (err) {
    console.error(`[file-parser] Failed to parse ${file.name}:`, err)
    return { text: "", warning: "parse_error" }
  }

  if (!result.trim()) {
    return { text: "", warning: "empty" }
  }

  if (result.length > MAX_FILE_CHARS) {
    return { text: result.slice(0, MAX_FILE_CHARS) + "\n[...file truncated]", warning: "truncated" }
  }
  return { text: result }
}

async function parseText(file: File): Promise<string> {
  return file.text()
}

async function parsePDF(
  file: File,
  options?: ParseOptions
): Promise<{ text: string; usedOCR: boolean }> {
  const pdfjsLib = await import("pdfjs-dist")

  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const pages: Array<string | null> = Array(pageLimit).fill(null)
  // Set so the dedup branch can add first-occurrence page numbers without duplicates; sorted to array below.
  const ocrPageSet = new Set<number>()
  const seen = new Set<string>()
  // Needed so repeated-text detection can retroactively queue the first occurrence; without it scanned docs only OCR page 1.
  const textFirstPage = new Map<string, number>()
  let totalLength = 0

  options?.onProgress?.("Reading PDF...", 2)

  // OCR a page when: text is empty/watermark-short; image ops mark it poster-
  // style; sparse text plus an image (covers, watermark-only extraction); or
  // its text duplicates an earlier page (repeated full-page text = download
  // stamp on a scan - queue both occurrences).
  for (let i = 1; i <= pageLimit; i++) {
    options?.onProgress?.(`Reading page ${i}/${pageLimit}`, Math.round(2 + (i / pageLimit) * 3))
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str ?? "")
      .join(" ")
    const trimmed = text.trim()
    const pageIndex = i - 1

    if (!trimmed) {
      ocrPageSet.add(i)
      continue
    }

    if (trimmed.length < WATERMARK_CHAR_THRESHOLD) {
      pages[pageIndex] = trimmed
      ocrPageSet.add(i)
      continue
    }

    // Image-driven page detection: only run on text-light pages where the
    // outcome can actually flip the OCR decision.
    let isImagePage = false
    if (trimmed.length < DENSE_TEXT_THRESHOLD) {
      let imageOps = 0
      try {
        const ops = await page.getOperatorList()
        for (const fn of ops.fnArray) {
          if (
            fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject ||
            fn === pdfjsLib.OPS.paintImageMaskXObject ||
            fn === pdfjsLib.OPS.paintImageXObjectRepeat
          ) {
            imageOps++
          }
        }
      } catch {
        // best-effort - if operator list parsing fails we just skip the rule
      }
      isImagePage =
        imageOps >= IMAGE_HEAVY_OPS_THRESHOLD ||
        (imageOps >= 1 && trimmed.length < SPARSE_TEXT_WITH_IMAGE_THRESHOLD)
    }

    if (isImagePage) {
      // Stash the extracted text as a fallback in case OCR fails for this page.
      pages[pageIndex] = trimmed
      ocrPageSet.add(i)
      continue
    }

    // Repeated full-page text = watermark on a scan; queue both occurrences (early `continue` used to drop the first).
    if (seen.has(trimmed)) {
      const firstPageNumber = textFirstPage.get(trimmed)
      if (firstPageNumber !== undefined) {
        ocrPageSet.add(firstPageNumber)
      }
      ocrPageSet.add(i)
      pages[pageIndex] = trimmed
      continue
    }

    seen.add(trimmed)
    textFirstPage.set(trimmed, i)
    pages[pageIndex] = trimmed
    totalLength += trimmed.length
    if (totalLength >= MAX_FILE_CHARS) break
  }

  // If no OCR candidates, return whatever text we got.
  if (ocrPageSet.size === 0) {
    return { text: joinPDFPages(pages), usedOCR: false }
  }

  // If we already hit the char limit from text pages, skip OCR
  if (totalLength >= MAX_FILE_CHARS) {
    return { text: joinPDFPages(pages), usedOCR: false }
  }

  // Sort so the slice cap always picks the earliest pages, not insertion order.
  const ocrPageIndices = [...ocrPageSet].sort((a, b) => a - b)

  // OCR short/empty pages via the server-side OCR endpoint.
  const ocrTargets = ocrPageIndices.slice(0, MAX_OCR_PAGES)
  options?.onProgress?.("Preparing pages...", 5)

  // Render OCR candidates to images first.
  const renderedPages: Array<{ pageNumber: number; base64: string }> = []
  for (let idx = 0; idx < ocrTargets.length; idx++) {
    const pct = Math.round(5 + (idx / ocrTargets.length) * 20)
    options?.onProgress?.(`Preparing ${idx + 1}/${ocrTargets.length}`, pct)

    const pageNumber = ocrTargets[idx]
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")
    if (!ctx) continue

    await page.render({ canvas, viewport }).promise
    const dataUrl = canvas.toDataURL("image/png")
    renderedPages.push({ pageNumber, base64: dataUrl.split(",")[1] })
  }

  if (renderedPages.length === 0) {
    return { text: joinPDFPages(pages), usedOCR: false }
  }

  // OCR one page at a time so the recovered text can be placed back into the
  // original document order.
  const userApiKey = options?.isAnonymous ? getClientKey("gemini") : ""
  try {
    for (let idx = 0; idx < renderedPages.length; idx++) {
      const { pageNumber, base64 } = renderedPages[idx]
      const pct = Math.round(25 + ((idx + 1) / renderedPages.length) * 70)
      options?.onProgress?.(`Reading page ${idx + 1}/${renderedPages.length}`, pct - 5)

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [base64], ...(userApiKey ? { userApiKey } : {}) }),
      })

      if (res.status === 402) {
        const missingProvider = await parseNoKeyProviderFromResponse(res)
        if (missingProvider) options?.onApiKeyRequired?.(missingProvider)
        throw new Error("OCR API key required")
      }
      if (!res.ok) throw new Error(`OCR API error: ${res.status}`)
      const { text: ocrText } = await res.json()
      const trimmed = (ocrText ?? "").trim()
      if (trimmed) pages[pageNumber - 1] = trimmed

      options?.onProgress?.(`Reading page ${idx + 1}/${renderedPages.length}`, pct)
    }

    options?.onProgress?.("Done", 100)
    return { text: joinPDFPages(pages), usedOCR: true }
  } catch (err) {
    console.error("[file-parser] Gemini OCR failed, falling back to Tesseract:", err)
    options?.onProgress?.("Fallback OCR...", 70)

    // Fallback: client-side Tesseract OCR
    const { createWorker } = await import("tesseract.js")
    const worker = await createWorker("kor+eng")
    try {
      for (let idx = 0; idx < renderedPages.length; idx++) {
        const pageNumber = renderedPages[idx].pageNumber
        const pct = Math.round(70 + (idx / renderedPages.length) * 25)
        options?.onProgress?.(`OCR page ${idx + 1}/${renderedPages.length}...`, pct)

        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
        const canvas = document.createElement("canvas")
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext("2d")
        if (!ctx) continue

        await page.render({ canvas, viewport }).promise
        const {
          data: { text },
        } = await worker.recognize(canvas)
        const trimmed = text.trim()
        if (trimmed) {
          pages[pageNumber - 1] = trimmed
        }
      }
      return { text: joinPDFPages(pages), usedOCR: true }
    } finally {
      await worker.terminate()
    }
  }
}

async function parseDOCX(file: File): Promise<string> {
  const mammoth = await import("mammoth")
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

async function parseExcel(file: File): Promise<string> {
  const XLSX = await import("xlsx")
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: "array" })

  const sheets: string[] = []
  let totalLength = 0
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) {
      sheets.push(`[Sheet: ${sheetName}]\n${csv}`)
      totalLength += csv.length
      if (totalLength >= MAX_FILE_CHARS) break
    }
  }

  return sheets.join("\n\n")
}
