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
const OCR_BATCH_SIZE = 2

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
        if (!pdfResult.text.trim()) return { text: '', warning: 'empty' }
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

  const pages: string[] = []
  const emptyPageIndices: number[] = []
  const seen = new Set<string>()
  let totalLength = 0
  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES)

  options?.onProgress?.('Reading PDF...', 2)

  // First pass: extract text from all pages.
  // Any page with below-threshold text is treated as a scanned/watermark-only page
  // and queued for OCR, regardless of whether we've "seen" the text before. This
  // ensures page 1 of a watermarked scan (which would otherwise be the first
  // occurrence and get kept as content) is still OCR'd.
  for (let i = 1; i <= pageLimit; i++) {
    options?.onProgress?.(`Reading page ${i}/${pageLimit}`, Math.round(2 + (i / pageLimit) * 3))
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str ?? '')
      .join(' ')
    const trimmed = text.trim()
    if (trimmed.length >= WATERMARK_CHAR_THRESHOLD && !seen.has(trimmed)) {
      seen.add(trimmed)
      pages.push(trimmed)
      totalLength += trimmed.length
      if (totalLength >= MAX_FILE_CHARS) break
    } else {
      // Empty, watermark-only, or duplicate short text -> OCR candidate
      emptyPageIndices.push(i)
    }
  }

  // If no empty pages, return whatever text we got
  if (emptyPageIndices.length === 0) {
    return { text: pages.join('\n\n'), usedOCR: false }
  }

  // If we already hit the char limit from text pages, skip OCR
  if (totalLength >= MAX_FILE_CHARS) {
    return { text: pages.join('\n\n'), usedOCR: false }
  }

  // OCR the empty pages (scanned images) via server-side Gemini Vision
  const ocrLimit = Math.min(emptyPageIndices.length, MAX_OCR_PAGES)
  options?.onProgress?.('Preparing pages...', 5)

  // Render all pages to images first
  const base64Images: string[] = []
  for (let idx = 0; idx < ocrLimit; idx++) {
    const pct = Math.round(5 + (idx / ocrLimit) * 20)
    options?.onProgress?.(`Preparing ${idx + 1}/${ocrLimit}`, pct)

    const page = await pdf.getPage(emptyPageIndices[idx])
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    await page.render({ canvas, viewport }).promise
    const dataUrl = canvas.toDataURL('image/png')
    base64Images.push(dataUrl.split(',')[1])
  }

  if (base64Images.length === 0) {
    return { text: pages.join('\n\n'), usedOCR: false }
  }

  // Process in batches so progress updates between Gemini calls
  try {
    const ocrTexts: string[] = []
    const totalBatches = Math.ceil(base64Images.length / OCR_BATCH_SIZE)

    for (let b = 0; b < totalBatches; b++) {
      const start = b * OCR_BATCH_SIZE
      const batch = base64Images.slice(start, start + OCR_BATCH_SIZE)
      const pct = Math.round(25 + ((b + 1) / totalBatches) * 70)
      const startPage = start + 1
      const endPage = Math.min(start + OCR_BATCH_SIZE, base64Images.length)
      options?.onProgress?.(`Reading pages ${startPage}-${endPage}/${base64Images.length}`, pct - 5)

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: batch }),
      })

      if (!res.ok) throw new Error(`OCR API error: ${res.status}`)
      const { text: ocrText } = await res.json()
      const trimmed = (ocrText ?? '').trim()
      if (trimmed) ocrTexts.push(trimmed)

      options?.onProgress?.(`Reading pages ${startPage}-${endPage}/${base64Images.length}`, pct)
    }

    options?.onProgress?.('Done', 100)

    if (ocrTexts.length > 0) {
      pages.push(ocrTexts.join('\n\n'))
    }

    return { text: pages.join('\n\n'), usedOCR: true }
  } catch (err) {
    console.error('[file-parser] Gemini OCR failed, falling back to Tesseract:', err)
    options?.onProgress?.('Fallback OCR...', 70)

    // Fallback: client-side Tesseract OCR
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('kor+eng')
    try {
      for (let idx = 0; idx < ocrLimit; idx++) {
        const pct = Math.round(70 + (idx / ocrLimit) * 25)
        options?.onProgress?.(`OCR page ${idx + 1}/${ocrLimit}...`, pct)

        const page = await pdf.getPage(emptyPageIndices[idx])
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
          pages.push(trimmed)
          totalLength += trimmed.length
          if (totalLength >= MAX_FILE_CHARS) break
        }
      }
      return { text: pages.join('\n\n'), usedOCR: true }
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
