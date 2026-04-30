/**
 * Pure credential storage logic — reads/writes an encrypted credential
 * blob to a JSON file. The encrypt/decrypt functions are injected so the
 * module is testable under vitest without Electron's safeStorage.
 *
 * In production, `auth.ts` passes `safeStorage.encryptString` /
 * `safeStorage.decryptString` as the crypto adapter. The encrypted blobs
 * are base64-encoded for safe JSON serialization.
 *
 * File layout (stored at `<userData>/thunder-desktop-credentials.json`):
 * ```json
 * { "token": "<base64>", "apiKey": "<base64>", "email": "<base64>", "password": "<base64?>" }
 * ```
 *
 * Single-env: Thunder Desktop only talks to one Halo backend, so we store
 * a single record (unlike halo-desktop which keys creds by env).
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface StoredCredentials {
  token: string
  apiKey: string
  email: string
  /** Present iff the user opted into "Stay signed in" at login time. */
  password?: string
}

export interface CryptoAdapter {
  encrypt: (plaintext: string) => Buffer
  decrypt: (ciphertext: Buffer) => string
  isAvailable: () => boolean
}

interface OnDiskCredentials {
  token: string
  apiKey: string
  email: string
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
  if (!entry?.token || !entry?.apiKey || !entry?.email) return null

  try {
    if (!crypto.isAvailable()) {
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
      email: crypto.decrypt(Buffer.from(entry.email, 'base64')),
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
      token: crypto.encrypt(creds.token).toString('base64'),
      apiKey: crypto.encrypt(creds.apiKey).toString('base64'),
      email: crypto.encrypt(creds.email).toString('base64'),
      ...(creds.password !== undefined && {
        password: crypto.encrypt(creds.password).toString('base64')
      })
    }
  } else {
    console.warn('[auth-io] safeStorage unavailable — refusing to persist password')
    payload = {
      token: creds.token,
      apiKey: creds.apiKey,
      email: creds.email
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
