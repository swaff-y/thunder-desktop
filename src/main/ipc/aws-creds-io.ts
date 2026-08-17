/**
 * TD-052: pure AWS credential storage — reads/writes a single IAM
 * credential record to a JSON file. Mirrors `auth-io.ts`: encrypt /
 * decrypt are injected so the module stays unit-testable under vitest
 * without Electron's `safeStorage`, and ciphertext is base64-encoded
 * for safe JSON serialisation.
 *
 * These keys sign Bedrock requests from the main process only. There is
 * deliberately no IPC getter (see `aws-creds.ts`) — the renderer can ask
 * whether credentials exist, never what they are.
 *
 * On-disk schema (stored at `<userData>/thunder-desktop-aws.enc`):
 * ```json
 * {
 *   "encrypted": true,
 *   "accessKeyId": "<base64 ciphertext>",
 *   "secretAccessKey": "<base64 ciphertext>",
 *   "sessionToken": "<base64 ciphertext>"
 * }
 * ```
 *
 * Unlike `auth-io.ts`, there is no plaintext fallback. Halo credentials
 * are re-obtainable by logging in again; a leaked IAM secret key is a
 * standing grant against the user's AWS account, so when `safeStorage`
 * is unavailable we refuse the write entirely and let the caller fall
 * through to the default AWS credential chain.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CryptoAdapter } from './auth-io'

export type { CryptoAdapter }

export interface StoredAwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  /** Present only for temporary (STS / SSO) credentials. */
  sessionToken?: string
}

interface OnDiskAwsCredentials {
  encrypted: boolean
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

function readFile(path: string): OnDiskAwsCredentials | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8')) as OnDiskAwsCredentials
  } catch {
    return null
  }
}

/**
 * Cheap existence probe backing the `thunder:aws:has` channel. Checks
 * the record is structurally complete rather than merely that the file
 * exists, so a truncated or half-written file reads as "not configured"
 * and the caller falls through to the default credential chain.
 *
 * Deliberately does not decrypt: `has` must stay callable from an IPC
 * handler without ever materialising key material.
 */
export function hasCredentials(path: string): boolean {
  const entry = readFile(path)
  return Boolean(entry?.encrypted && entry.accessKeyId && entry.secretAccessKey)
}

export function getCredentials(path: string, crypto: CryptoAdapter): StoredAwsCredentials | null {
  const entry = readFile(path)
  if (!entry?.accessKeyId || !entry?.secretAccessKey) return null

  // Records are only ever written encrypted. A record claiming
  // otherwise, or one written on a machine whose safeStorage we can no
  // longer reach, is refused rather than returned as garbage that would
  // fail SigV4 with an opaque signature error.
  if (!entry.encrypted) return null
  if (!crypto.isAvailable()) {
    console.warn('[aws-creds-io] stored credentials are encrypted but safeStorage is unavailable')
    return null
  }

  try {
    return {
      accessKeyId: crypto.decrypt(Buffer.from(entry.accessKeyId, 'base64')),
      secretAccessKey: crypto.decrypt(Buffer.from(entry.secretAccessKey, 'base64')),
      sessionToken: entry.sessionToken
        ? crypto.decrypt(Buffer.from(entry.sessionToken, 'base64'))
        : undefined
    }
  } catch (error) {
    console.error('[aws-creds-io] failed to decrypt credentials', error)
    return null
  }
}

/**
 * Returns `false` (and writes nothing) when `safeStorage` is
 * unavailable — see the module header for why there's no plaintext
 * fallback. Callers surface this to the user rather than reporting a
 * save that didn't happen.
 */
export function setCredentials(
  path: string,
  crypto: CryptoAdapter,
  creds: StoredAwsCredentials
): boolean {
  if (!crypto.isAvailable()) {
    console.warn('[aws-creds-io] safeStorage unavailable — refusing to persist AWS credentials')
    return false
  }

  const payload: OnDiskAwsCredentials = {
    encrypted: true,
    accessKeyId: crypto.encrypt(creds.accessKeyId).toString('base64'),
    secretAccessKey: crypto.encrypt(creds.secretAccessKey).toString('base64'),
    ...(creds.sessionToken !== undefined && {
      sessionToken: crypto.encrypt(creds.sessionToken).toString('base64')
    })
  }

  const content = JSON.stringify(payload, null, 2)
  const tmpPath = join(dirname(path), `.aws-creds-${process.pid}-${Date.now()}.tmp`)
  writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmpPath, path)
  return true
}

export function clearCredentials(path: string): void {
  if (!existsSync(path)) return
  try {
    unlinkSync(path)
  } catch (error) {
    console.error('[aws-creds-io] failed to clear credentials', error)
  }
}
