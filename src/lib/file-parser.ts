/**
 * Client-side file parsing for PDF, DOCX, and Excel files.
 * Extracts text content that can be included in AI prompts.
 */

const MAX_FILE_CHARS = 50000
const MAX_PDF_PAGES = 20
const MAX_FILE_SIZE_MB = 50
const MAX_OCR_PAGES = 10
const OCR_RENDER_SCALE = 2

export const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "txt", "md", "csv"])

export type ParseWarning = "truncated" | "empty" | "too_large" | "parse_error"

export interface ParseResult {
  text: string
  warning?: ParseWarning
  usedOCR?: boolean
}

export interface ParseOptions {
  onProgress?: (status: string) => void
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

  // First pass: extract text from all pages
  for (let i = 1; i <= pageLimit; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str ?? '')
      .join(' ')
    const trimmed = text.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      pages.push(trimmed)
      totalLength += trimmed.length
      if (totalLength >= MAX_FILE_CHARS) break
    } else if (!trimmed) {
      emptyPageIndices.push(i)
    }
  }

  // If we got text from normal extraction, return it
  if (pages.length > 0) {
    return { text: pages.join('\n\n'), usedOCR: false }
  }

  // No text found - attempt OCR on empty pages (likely scanned document)
  if (emptyPageIndices.length === 0) {
    return { text: '', usedOCR: false }
  }

  options?.onProgress?.('Loading OCR engine...')

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('kor+eng')

  try {
    const ocrPages: string[] = []
    const ocrLimit = Math.min(emptyPageIndices.length, MAX_OCR_PAGES)

    for (let idx = 0; idx < ocrLimit; idx++) {
      const pageNum = emptyPageIndices[idx]
      options?.onProgress?.(`OCR page ${idx + 1}/${ocrLimit}...`)

      const page = await pdf.getPage(pageNum)
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
        ocrPages.push(trimmed)
        totalLength += trimmed.length
        if (totalLength >= MAX_FILE_CHARS) break
      }
    }

    return { text: ocrPages.join('\n\n'), usedOCR: true }
  } finally {
    await worker.terminate()
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
