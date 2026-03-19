import {
  VertexAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google-cloud/vertexai"
import type { Message } from "@/types"

const projectId = process.env.VERTEX_PROJECT_ID!
const location = process.env.VERTEX_LOCATION!

export async function queryGemini(
  systemPrompt: string,
  messages: Message[]
): Promise<string> {
  const vertexAI = new VertexAI({ project: projectId, location })

  const model = vertexAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ],
  })

  const contents = messages.map((msg) => ({
    role: msg.sender === "user" ? "user" : "model",
    parts: [{ text: `[${msg.displayName}]: ${msg.content}` }],
  }))

  const result = await model.generateContent({
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents,
  })

  const response = result.response
  const text =
    response.candidates?.[0]?.content?.parts?.[0]?.text ?? ""

  if (!text) {
    throw new Error("Gemini returned an empty response")
  }

  return text
}
