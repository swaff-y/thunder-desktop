/**
 * TD-094: the password a user opted into replaying behind Touch ID.
 *
 * Pure I/O with crypto injected, the same split as `auth-io.ts` — so it
 * is testable under vitest without Electron's `safeStorage`, and so
 * `biometric.ts` is the only module holding the Electron surface.
 *
 * Its own file at `<userData>/thunder-desktop-biometric.enc`, separate
 * from the credential record TD-093 spent a ticket cleaning out, so
 * "forget my password" is a delete that touches nothing the session
 * depends on.
 *
 * On-disk schema:
 * ```json
 * { "encrypted": true, "email": "<base64>", "password": "<base64>" }
 * ```
 *
 * The email is stored beside the password because the replay is a
 * `POST v1/login` and needs both: by the time the unlock button is
 * offered, the dead refresh token has already taken the credential
 * record — and the email in it — with it.
 *
 * `encrypted` is always `true`: {@link remember} refuses to write
 * without `safeStorage`, because a password in the clear on disk is
 * worse than the feature being unavailable. The flag is read back for
 * the reason `auth-io` documents — a record written on a machine with
 * encryption and read on one without must be refused, not handed back
 * as base64 noise.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errorMessage } from '../../shared/errors'
import type { CryptoAdapter } from './auth-io'

export type { CryptoAdapter }

/** What a replay needs. Never leaves the main process. */
export interface RememberedLogin {
  email: string
  password: string
}

interface OnDiskRemembered {
  encrypted: boolean
  email: string
  password: string
}

function readFile(path: string): OnDiskRemembered | null {
  try {
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as OnDiskRemembered
    if (!parsed?.email || !parsed?.password) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Refuses to write without encryption, and reports it rather than
 * throwing — the caller rides on a sign-in that has already succeeded.
 */
export function remember(path: string, crypto: CryptoAdapter, login: RememberedLogin): boolean {
  if (!crypto.isAvailable()) {
    console.warn('[biometric-store] safeStorage unavailable — refusing to persist a password')
    return false
  }
  const payload: OnDiskRemembered = {
    encrypted: true,
    email: crypto.encrypt(login.email).toString('base64'),
    password: crypto.encrypt(login.password).toString('base64')
  }
  const tmpPath = join(dirname(path), `.thunder-biometric-${process.pid}-${Date.now()}.tmp`)
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmpPath, path)
  return true
}

export function recall(path: string, crypto: CryptoAdapter): RememberedLogin | null {
  const entry = readFile(path)
  if (entry === null) return null
  if (!entry.encrypted || !crypto.isAvailable()) return null
  try {
    return {
      email: crypto.decrypt(Buffer.from(entry.email, 'base64')),
      password: crypto.decrypt(Buffer.from(entry.password, 'base64'))
    }
  } catch (error) {
    // Deliberately the message only — the thrown value on this path can
    // carry the ciphertext it failed on.
    console.error('[biometric-store] failed to decrypt the remembered login:', errorMessage(error))
    return null
  }
}

export function forget(path: string): void {
  if (!existsSync(path)) return
  try {
    unlinkSync(path)
  } catch (error) {
    console.error('[biometric-store] failed to forget the remembered login:', errorMessage(error))
  }
}

/** Whether there is a record to replay, without decrypting it. */
export function has(path: string): boolean {
  return readFile(path) !== null
}
