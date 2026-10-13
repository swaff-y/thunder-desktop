import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'node:path'
import { THUNDER_IPC_CHANNELS, type ThunderAuthCredentials } from '../../preload/thunder-api'
import {
  clearCredentials,
  getCredentials,
  getToken,
  setCredentials,
  type CryptoAdapter
} from './auth-io'
import { AUTH_CREDENTIALS_FILENAME } from '../userdata-seed'

/**
 * Re-exported so the smoke script can keep resolving the same file
 * outside Electron. The constant itself lives in `userdata-seed`
 * (TD-063) because the dev-profile seed has to enumerate it alongside
 * the other `userData` files.
 */
export { AUTH_CREDENTIALS_FILENAME }

function credentialsPath(): string {
  return join(app.getPath('userData'), AUTH_CREDENTIALS_FILENAME)
}

/**
 * Exported for TD-094: the remembered-password store encrypts with the
 * same adapter, and a second copy of these three lines is a drift trap.
 */
export const safeStorageCrypto: CryptoAdapter = {
  encrypt: (plaintext) => safeStorage.encryptString(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
  isAvailable: () => safeStorage.isEncryptionAvailable()
}

function isValidAuthPayload(value: unknown): value is ThunderAuthCredentials {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.token !== 'string' || v.token.length === 0) return false
  if (typeof v.apiKey !== 'string' || v.apiKey.length === 0) return false
  if (v.email !== undefined && typeof v.email !== 'string') return false
  if (v.refreshToken !== undefined && typeof v.refreshToken !== 'string') return false
  return true
}

/**
 * TD-053: main-process only. The halo-mcp client reads this on every
 * request rather than caching it — a silent reauth rewrites the stored
 * record, and a captured token would outlive its own session.
 */
export function resolveAuthToken(): string | undefined {
  return getToken(credentialsPath(), safeStorageCrypto) ?? undefined
}

/**
 * TD-094: the one write path into the credential record from outside
 * this module. A Touch ID unlock mints its session in main, so main is
 * what has to persist it — and it goes through `setCredentials` like
 * every other write, rather than near the file.
 */
export function writeAuthCredentials(creds: ThunderAuthCredentials): void {
  setCredentials(credentialsPath(), safeStorageCrypto, creds)
}

export function registerAuthHandlers(): void {
  ipcMain.handle(THUNDER_IPC_CHANNELS.authGet, async () => {
    return getCredentials(credentialsPath(), safeStorageCrypto)
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.authSet, async (_event, payload: unknown) => {
    if (!isValidAuthPayload(payload)) {
      throw new Error('Invalid credentials payload')
    }
    setCredentials(credentialsPath(), safeStorageCrypto, payload)
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.authClear, async () => {
    clearCredentials(credentialsPath())
  })
}
