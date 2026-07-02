/**
 * Client-side file parsing for PDF, DOCX, and Excel files.
 * Extracts text content that can be included in AI prompts.
 */

import type { Provider } from "@/types"
import { parseNoKeyProviderFromResponse } from "@/lib/api-key-errors"

const MAX_FILE_CHARS = 50000
const MAX_PDF_PAGES = 20
const MAX_FILE_SIZE_MB = 50
const MAX_OCR_PAGES = 10
const OCR_RENDER_SCALE = 2
// Pages with fewer than this many characters are treated as scanned/watermark-only.
// Kept low (30) so that legitimate text PDFs with sparse cover/divider pages are not
// incorrectly queued for OCR. The page-1 watermark fix still works as long as the
// watermark text is short, which is the common case.
const WATERMARK_CHAR_THRESHOLD = 30
// Pages with at least this many image paint operators (XObject draws, inline
// images, image masks, and repeated XObject draws all count) are treated as
// graphical/poster layouts whose content of interest (prices, schedules,
// charts) is rendered as image text that pdf.js cannot read. They get OCR'd
// even when pdf.js extracted substantial text. Threshold is intentionally
// above the typical text-PDF case of one or two header/footer logos so normal
// documents are not re-OCR'd.
const IMAGE_HEAVY_OPS_THRESHOLD = 4
// Sparse-text pages with at least one image are treated as image-driven (single
// big poster + caption layouts, or scanned pages where pdf.js only recovers a
// watermark/header overlay). Was 100, bumped to 300 so Korean court watermark
// headers (which typically run ~140-200 chars: court name + case number +
// submission date + personal-info warning + submitter + timestamps) also get
// queued for OCR. Regular text-PDF pages have thousands of characters of body
// text, so 300 still gives plenty of headroom for legit short-content pages
// like a divider or a blank chapter opener.
const SPARSE_TEXT_WITH_IMAGE_THRESHOLD = 300
// Above this character count a page is considered text-dense and we skip the
// image detection pass entirely. Avoids paying for getOperatorList on long
// text-only pages where the outcome cannot flip.
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
  // Use a Set instead of an array so the dedup-to-OCR branch can push the
  // retroactively-discovered first-page-number without worrying about
  // duplicates, and so the final MAX_OCR_PAGES slice is deterministic
  // regardless of insertion order. Converted to a sorted array below so
  // the earliest pages are always processed first and never clipped by
  // the slice cap even if they were added late.
  const ocrPageSet = new Set<number>()
  const seen = new Set<string>()
  // Track the first page a given text was seen on so we can retroactively
  // queue the first occurrence for OCR when a later page repeats the same
  // text. Without this, a scanned Korean legal PDF where every page only
  // exposes the court's download-stamp header to pdf.js would add page 1
  // to `pages`, then silently drop pages 2..N via the `seen` dedup and
  // never OCR anything - leaving the user with nothing but the header.
  const textFirstPage = new Map<string, number>()
  let totalLength = 0

  options?.onProgress?.("Reading PDF...", 2)

  // First pass: extract text from all pages and decide which need OCR.
  // A page is queued for OCR if any of the following hold:
  //   1. The extracted text is empty or watermark-short (existing scanned-page rule).
  //   2. The page has many image operators - a graphical/poster layout where the
  //      content of interest (prices, schedules, charts) is rendered as image text
  //      that pdf.js cannot read.
  //   3. The page has at least one image AND the extracted text is sparse
  //      (< SPARSE_TEXT_WITH_IMAGE_THRESHOLD), which catches cover pages,
  //      schedule pages, and scanned pages where only a watermark/header
  //      overlay made it through pdf.js's text extraction.
  //   4. The page's extracted text is identical to text we already saw on an
  //      earlier page. Identical full-page text across multiple pages is
  //      almost always a watermark / download stamp on a scanned document;
  //      the body content is a bitmap that pdf.js missed, and the earlier
  //      occurrence is almost certainly the same kind of scanned page. Both
  //      the current page AND its first sighting get queued.
  // Text-dense pages skip the image detection pass entirely, so the cost of
  // getOperatorList is only paid on pages where it can actually change the result.
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

    // Repeated full-page text = watermark/header stamp on a scanned doc.
    // Queue BOTH this page and the first occurrence for OCR, and keep the
    // watermark as a fallback on both in case OCR fails. Previously we
    // returned early via `continue` here, which silently dropped the
    // repeated page AND missed the fact that the first occurrence was
    // also a scanned page under the same watermark.
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

  // Sort ascending so the earliest pages always win the MAX_OCR_PAGES
  // slice. If we pushed in insertion order instead, a retroactively-
  // added first-occurrence page number could sit at the tail of a full
  // queue and get clipped off, defeating the dedup-to-OCR repair.
  // Sorting guarantees "earliest 10 pages in the document" regardless
  // of which branch added them when.
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
  try {
    for (let idx = 0; idx < renderedPages.length; idx++) {
      const { pageNumber, base64 } = renderedPages[idx]
      const pct = Math.round(25 + ((idx + 1) / renderedPages.length) * 70)
      options?.onProgress?.(`Reading page ${idx + 1}/${renderedPages.length}`, pct - 5)

      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [base64] }),
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
