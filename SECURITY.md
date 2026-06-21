# Security

## User-Supplied API Keys

Quorum supports BYOK for signed-in users. User-supplied provider keys are:

- sent only to the server API over the app's normal HTTPS connection
- encrypted before storage with AES-256-GCM
- scoped to the authenticated user account
- never returned to the browser after saving; the settings UI receives only configured/not-configured status
- decrypted only inside server-side provider calls for the selected model

Set `KEY_ENCRYPTION_SECRET` in production. If it is not set, the server falls back to `AUTH_SECRET`; using a dedicated encryption secret is recommended. Rotating this value requires re-encrypting or replacing stored user API keys.

Provider errors and application logs should not contain raw API keys. Known key formats are redacted before provider errors are logged or sent back through the chat stream.

## Local Secrets

Use `.env.local` for local credentials. Do not commit `.env`, `.env.local`, service-account JSON files, database URLs, OAuth secrets, or provider API keys.

`.env.example` must contain placeholders only.

## Reporting Vulnerabilities

Please open a private report with the maintainer if you find a security issue. Include the affected route or feature, reproduction steps, and whether credentials or user content may be exposed.
