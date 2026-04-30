/**
 * Pure credential storage logic — reads/writes a single credential record
 * to a JSON file. Encrypt/decrypt is injected so the module is testable
 * under vitest without Electron's safeStorage.
 *
 * In production, `auth.ts` passes `safeStorage.encryptString` /
 * `safeStorage.decryptString` as the crypto adapter. The encrypted blobs
 * are base64-encoded for safe JSON serialization.
 *
 * On-disk schema (stored at `<userData>/thunder-desktop-credentials.enc`):
 * ```json
 * {
 *   "encrypted": true,
 *   "token": "<base64 ciphertext or plaintext>",
 *   "apiKey": "...",
 *   "email": "...",
 *   "password": "..."
 * }
 * ```
 *
 * The `encrypted` flag pins each record to the encryption mode it was
 * written under. Without it, a record written under safeStorage would be
 * returned verbatim (as base64 ciphertext) on a system where safeStorage
 * has since become unavailable — silently handing the renderer garbage
 * "credentials" that fail every API call. With the flag, the read path
 * refuses mismatched records and forces the user to re-login.
 *
 * Single-env: Thunder Desktop only talks to one Halo backend, so we store
 * a single record (unlike halo-desktop which keys creds by env).
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface StoredCredentials {
  token: string
  apiKey: string
  /** Optional — pre-TD-030 migrations only carry token + apiKey. */
  email?: string
  /** Present iff the user opted into "Stay signed in" at login time. */
  password?: string
}

export interface CryptoAdapter {
  encrypt: (plaintext: string) => Buffer
  decrypt: (ciphertext: Buffer) => string
  isAvailable: () => boolean
}

interface OnDiskCredentials {
  encrypted: boolean
  token: string
  apiKey: string
  email?: string
  password?: string
}

function readFile(path: string): OnDiskCredentials | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as OnDiskCredentials
  } catch {
    return null
  }
}

function writeFile(filePath: string, data: OnDiskCredentials): void {
  const content = JSON.stringify(data, null, 2)
  const tmpPath = join(dirname(filePath), `.creds-${Date.now()}.tmp`)
  writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmpPath, filePath)
}

export function getCredentials(path: string, crypto: CryptoAdapter): StoredCredentials | null {
  const entry = readFile(path)
  if (!entry?.token || !entry?.apiKey) return null

  // Encryption-mode mismatch: the record was written encrypted but
  // safeStorage is no longer available (e.g. user moved their profile
  // between machines), or it was written plaintext but we now have
  // safeStorage and would garble it. Either way, refuse — the renderer
  // will treat us as logged-out and the user re-logs in.
  if (entry.encrypted && !crypto.isAvailable()) {
    console.warn('[auth-io] stored credentials are encrypted but safeStorage is unavailable')
    return null
  }
  if (!entry.encrypted && crypto.isAvailable()) {
    // Legacy plaintext record on a system that now has safeStorage —
    // honour it once. Future writes will encrypt.
  }

  try {
    if (!entry.encrypted) {
      return {
        token: entry.token,
        apiKey: entry.apiKey,
        email: entry.email,
        password: entry.password
      }
    }
    return {
      token: crypto.decrypt(Buffer.from(entry.token, 'base64')),
      apiKey: crypto.decrypt(Buffer.from(entry.apiKey, 'base64')),
      email: entry.email ? crypto.decrypt(Buffer.from(entry.email, 'base64')) : undefined,
      password: entry.password ? crypto.decrypt(Buffer.from(entry.password, 'base64')) : undefined
    }
  } catch (error) {
    console.error('[auth-io] failed to decrypt credentials', error)
    return null
  }
}

export function setCredentials(
  path: string,
  crypto: CryptoAdapter,
  creds: StoredCredentials
): void {
  let payload: OnDiskCredentials
  if (crypto.isAvailable()) {
    payload = {
      encrypted: true,
      token: crypto.encrypt(creds.token).toString('base64'),
      apiKey: crypto.encrypt(creds.apiKey).toString('base64'),
      ...(creds.email !== undefined && {
        email: crypto.encrypt(creds.email).toString('base64')
      }),
      ...(creds.password !== undefined && {
        password: crypto.encrypt(creds.password).toString('base64')
      })
    }
  } else {
    console.warn('[auth-io] safeStorage unavailable — refusing to persist password')
    payload = {
      encrypted: false,
      token: creds.token,
      apiKey: creds.apiKey,
      ...(creds.email !== undefined && { email: creds.email })
    }
  }
  writeFile(path, payload)
}

export function clearCredentials(path: string): void {
  if (!existsSync(path)) return
  try {
    unlinkSync(path)
  } catch (error) {
    console.error('[auth-io] failed to clear credentials', error)
  }
}
