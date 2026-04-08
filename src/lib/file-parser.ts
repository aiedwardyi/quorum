/**
 * Client-side file parsing for PDF, DOCX, and Excel files.
 * Extracts text content that can be included in AI prompts.
 */

const MAX_FILE_CHARS = 50000
const MAX_PDF_PAGES = 20

export const SUPPORTED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "xls", "txt", "md", "csv"])

export type ParseWarning = "truncated" | "empty"

export interface ParseResult {
  text: string
  warning?: ParseWarning
}

export async function parseFile(file: File): Promise<ParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  let result: string
  if (ext === 'pdf') result = await parsePDF(file)
  else if (ext === 'docx') result = await parseDOCX(file)
  else if (ext === 'xlsx' || ext === 'xls') result = await parseExcel(file)
  else if (ext === 'txt' || ext === 'md' || ext === 'csv') result = await parseText(file)
  else return { text: `[Unsupported file type: ${file.name}]` }

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

async function parsePDF(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')

  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const pages: string[] = []
  let totalLength = 0
  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES)
  for (let i = 1; i <= pageLimit; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str ?? '')
      .join(' ')
    if (text.trim()) {
      pages.push(text.trim())
      totalLength += text.trim().length
      if (totalLength >= MAX_FILE_CHARS) break
    }
  }

  return pages.join('\n\n')
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
