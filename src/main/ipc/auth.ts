import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'node:path'
import { THUNDER_IPC_CHANNELS, type ThunderAuthCredentials } from '../../preload/thunder-api'
import {
  clearCredentials,
  getCredentials,
  setCredentials,
  type CryptoAdapter
} from './auth-io'

function credentialsPath(): string {
  return join(app.getPath('userData'), 'thunder-desktop-credentials.enc')
}

const crypto: CryptoAdapter = {
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
  if (v.password !== undefined && typeof v.password !== 'string') return false
  return true
}

export function registerAuthHandlers(): void {
  ipcMain.handle(THUNDER_IPC_CHANNELS.authGet, async () => {
    return getCredentials(credentialsPath(), crypto)
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.authSet, async (_event, payload: unknown) => {
    if (!isValidAuthPayload(payload)) {
      throw new Error('Invalid credentials payload')
    }
    setCredentials(credentialsPath(), crypto, payload)
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.authClear, async () => {
    clearCredentials(credentialsPath())
  })
}
