/**
 * Client-side file parsing for PDF, DOCX, and Excel files.
 * Extracts text content that can be included in AI prompts.
 */

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
}

function joinPDFPages(pages: Array<string | null | undefined>): string {
  return pages.map((page) => page?.trim() ?? '').filter(Boolean).join('\n\n')
}

export async function parseFile(file: File, options?: ParseOptions): Promise<ParseResult> {
  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > MAX_FILE_SIZE_MB) {
    return { text: '', warning: 'too_large' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let result: string
  try {
    if (ext === 'pdf') {
      const pdfResult = await parsePDF(file, options)
      if (pdfResult.usedOCR) {
        if (!pdfResult.text.trim()) return { text: '', warning: 'empty', usedOCR: true }
        if (pdfResult.text.length > MAX_FILE_CHARS) {
          return { text: pdfResult.text.slice(0, MAX_FILE_CHARS) + '\n[...file truncated]', warning: 'truncated', usedOCR: true }
        }
        return { text: pdfResult.text, usedOCR: true }
      }
      result = pdfResult.text
    } else if (ext === 'docx') result = await parseDOCX(file)
    else if (ext === 'xlsx' || ext === 'xls') result = await parseExcel(file)
    else if (ext === 'txt' || ext === 'md' || ext === 'csv') result = await parseText(file)
    else return { text: `[Unsupported file type: ${file.name}]` }
  } catch (err) {
    console.error(`[file-parser] Failed to parse ${file.name}:`, err)
    return { text: '', warning: 'parse_error' }
  }

  if (!result.trim()) {
    return { text: '', warning: 'empty' }
  }

  if (result.length > MAX_FILE_CHARS) {
    return { text: result.slice(0, MAX_FILE_CHARS) + '\n[...file truncated]', warning: 'truncated' }
  }
  return { text: result }
}

async function parseText(file: File): Promise<string> {
  return file.text()
}

async function parsePDF(file: File, options?: ParseOptions): Promise<{ text: string; usedOCR: boolean }> {
  const pdfjsLib = await import('pdfjs-dist')

  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const pages: Array<string | null> = Array(pageLimit).fill(null)
  const ocrPageIndices: number[] = []
  const seen = new Set<string>()
  let totalLength = 0

  options?.onProgress?.('Reading PDF...', 2)

  // First pass: extract text from all pages.
  // Keep any non-empty extracted text as a fallback, and only queue short pages
  // for OCR. This preserves sparse text pages if OCR underperforms while still
  // allowing watermark-heavy scanned pages to be re-read. Duplicate long pages
  // are skipped without triggering OCR.
  for (let i = 1; i <= pageLimit; i++) {
    options?.onProgress?.(`Reading page ${i}/${pageLimit}`, Math.round(2 + (i / pageLimit) * 3))
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str ?? '')
      .join(' ')
    const trimmed = text.trim()
    const pageIndex = i - 1

    if (!trimmed) {
      ocrPageIndices.push(i)
      continue
    }

    if (trimmed.length < WATERMARK_CHAR_THRESHOLD) {
      pages[pageIndex] = trimmed
      ocrPageIndices.push(i)
      continue
    }

    if (seen.has(trimmed)) continue

    seen.add(trimmed)
    pages[pageIndex] = trimmed
    totalLength += trimmed.length
    if (totalLength >= MAX_FILE_CHARS) break
  }

  // If no OCR candidates, return whatever text we got.
  if (ocrPageIndices.length === 0) {
    return { text: joinPDFPages(pages), usedOCR: false }
  }

  // If we already hit the char limit from text pages, skip OCR
  if (totalLength >= MAX_FILE_CHARS) {
    return { text: joinPDFPages(pages), usedOCR: false }
  }

  // OCR short/empty pages via the server-side OCR endpoint.
  const ocrTargets = ocrPageIndices.slice(0, MAX_OCR_PAGES)
  options?.onProgress?.('Preparing pages...', 5)

  // Render OCR candidates to images first.
  const renderedPages: Array<{ pageNumber: number; base64: string }> = []
  for (let idx = 0; idx < ocrTargets.length; idx++) {
    const pct = Math.round(5 + (idx / ocrTargets.length) * 20)
    options?.onProgress?.(`Preparing ${idx + 1}/${ocrTargets.length}`, pct)

    const pageNumber = ocrTargets[idx]
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    await page.render({ canvas, viewport }).promise
    const dataUrl = canvas.toDataURL('image/png')
    renderedPages.push({ pageNumber, base64: dataUrl.split(',')[1] })
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

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: [base64] }),
      })

      if (!res.ok) throw new Error(`OCR API error: ${res.status}`)
      const { text: ocrText } = await res.json()
      const trimmed = (ocrText ?? '').trim()
      if (trimmed) pages[pageNumber - 1] = trimmed

      options?.onProgress?.(`Reading page ${idx + 1}/${renderedPages.length}`, pct)
    }

    options?.onProgress?.('Done', 100)
    return { text: joinPDFPages(pages), usedOCR: true }
  } catch (err) {
    console.error('[file-parser] Gemini OCR failed, falling back to Tesseract:', err)
    options?.onProgress?.('Fallback OCR...', 70)

    // Fallback: client-side Tesseract OCR
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('kor+eng')
    try {
      for (let idx = 0; idx < renderedPages.length; idx++) {
        const pageNumber = renderedPages[idx].pageNumber
        const pct = Math.round(70 + (idx / renderedPages.length) * 25)
        options?.onProgress?.(`OCR page ${idx + 1}/${renderedPages.length}...`, pct)

        const page = await pdf.getPage(pageNumber)
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        if (!ctx) continue

        await page.render({ canvas, viewport }).promise
        const { data: { text } } = await worker.recognize(canvas)
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
  const mammoth = await import('mammoth')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value
}

async function parseExcel(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })

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

  return sheets.join('\n\n')
}
