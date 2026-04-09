import { NextRequest, NextResponse } from "next/server"
import { VertexAI } from "@google-cloud/vertexai"
import { getVertexConfig } from "@/lib/vertex-config"

function getModel() {
  const { projectId, location } = getVertexConfig()
  const opts: ConstructorParameters<typeof VertexAI>[0] = { project: projectId, location }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    opts.googleAuthOptions = {
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    }
  }
  const vertexAI = new VertexAI(opts)
  return vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" })
}

export async function POST(req: NextRequest) {
  try {
    const { images } = (await req.json()) as { images: string[] }

    if (!images?.length) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 })
    }

    const model = getModel()

    const parts = images.flatMap((base64, i) => [
      { text: `--- Page ${i + 1} ---` },
      {
        inlineData: {
          mimeType: "image/png" as const,
          data: base64,
        },
      },
    ])

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Extract ALL text from these scanned document pages. Return ONLY the extracted text, preserving the original language and formatting. Do not summarize, translate, or add commentary. Include every word, number, date, and name exactly as written. Separate pages with blank lines.`,
            },
            ...parts,
          ],
        },
      ],
    })

    const response = result.response
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

    return NextResponse.json({ text })
  } catch (err) {
    console.error("[ocr] Failed:", err)
    return NextResponse.json(
      { error: "OCR failed", details: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
