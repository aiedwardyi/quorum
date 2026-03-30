const PLACEHOLDER_PROJECT_ID = "your_google_cloud_project_id"
const PLACEHOLDER_LOCATION = "your_vertex_location"

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export function getVertexConfig() {
  const projectId = getRequiredEnv("VERTEX_PROJECT_ID")
  const location = getRequiredEnv("VERTEX_LOCATION")

  if (projectId === PLACEHOLDER_PROJECT_ID) {
    throw new Error(
      "Invalid Vertex AI setup: replace VERTEX_PROJECT_ID in .env with your real Google Cloud project ID"
    )
  }

  if (location === PLACEHOLDER_LOCATION) {
    throw new Error(
      "Invalid Vertex AI setup: replace VERTEX_LOCATION in .env with a real Vertex region like us-central1"
    )
  }

  return { projectId, location }
}
