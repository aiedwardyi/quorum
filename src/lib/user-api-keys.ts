/** Encrypted server-side storage and retrieval of per-user provider API keys. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"
import { prisma } from "@/lib/prisma"
import { type Provider, USER_API_KEY_PROVIDERS } from "@/types"

export { USER_API_KEY_PROVIDERS }

type KeyStatus = Record<Provider, { configured: boolean; updatedAt: string | null }>

const ENCRYPTION_VERSION = "v1"
const IV_BYTES = 12

export function isUserApiKeyProvider(value: unknown): value is Provider {
  return typeof value === "string" && (USER_API_KEY_PROVIDERS as readonly string[]).includes(value)
}

function isConfiguredSecret(secret: string | undefined): secret is string {
  return Boolean(secret && !secret.startsWith("generate_with_") && !secret.startsWith("your_"))
}

// Existing stored keys are encrypted with the configured secret at save time.
// Changing KEY_ENCRYPTION_SECRET or AUTH_SECRET later makes them undecryptable until re-saved.
function getEncryptionSecret(): string {
  const keyEncryptionSecret = process.env.KEY_ENCRYPTION_SECRET
  if (isConfiguredSecret(keyEncryptionSecret)) {
    return keyEncryptionSecret
  }

  const authSecret = process.env.AUTH_SECRET
  if (isConfiguredSecret(authSecret)) {
    return authSecret
  }

  throw new Error("KEY_ENCRYPTION_SECRET or AUTH_SECRET must be configured before storing API keys")
}

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(getEncryptionSecret(), "utf8").digest()
}

export function encryptApiKey(plainText: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptApiKey(encryptedValue: string): string {
  const [version, ivBase64, tagBase64, encryptedBase64] = encryptedValue.split(":")
  if (version !== ENCRYPTION_VERSION || !ivBase64 || !tagBase64 || !encryptedBase64) {
    throw new Error("Unsupported encrypted API key format")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64")
  )
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]).toString("utf8")
}

export async function getUserApiKeyStatus(userId: string): Promise<KeyStatus> {
  const status = USER_API_KEY_PROVIDERS.reduce((acc, provider) => {
    acc[provider] = { configured: false, updatedAt: null }
    return acc
  }, {} as KeyStatus)

  const records = await prisma.userApiKey.findMany({
    where: { userId },
    select: { provider: true, updatedAt: true },
  })

  for (const record of records) {
    if (isUserApiKeyProvider(record.provider)) {
      status[record.provider] = {
        configured: true,
        updatedAt: record.updatedAt.toISOString(),
      }
    }
  }

  return status
}

export async function saveUserApiKey(userId: string, provider: Provider, apiKey: string) {
  const encryptedKey = encryptApiKey(apiKey)
  await prisma.userApiKey.upsert({
    where: { userId_provider: { userId, provider } },
    update: { encryptedKey },
    create: { userId, provider, encryptedKey },
  })
}

export async function deleteUserApiKey(userId: string, provider: Provider) {
  await prisma.userApiKey.deleteMany({
    where: { userId, provider },
  })
}

export async function getUserProviderApiKey(
  userId: string,
  provider: Provider
): Promise<string | undefined> {
  const record = await prisma.userApiKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { encryptedKey: true },
  })

  return record ? decryptApiKey(record.encryptedKey) : undefined
}
