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
  return join(app.getPath('userData'), 'thunder-desktop-credentials.json')
}

const crypto: CryptoAdapter = {
  encrypt: (plaintext) => safeStorage.encryptString(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
  isAvailable: () => safeStorage.isEncryptionAvailable()
}

export function registerAuthHandlers(): void {
  ipcMain.handle(THUNDER_IPC_CHANNELS.authGet, async () => {
    return getCredentials(credentialsPath(), crypto)
  })

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.authSet,
    async (_event, creds: ThunderAuthCredentials) => {
      setCredentials(credentialsPath(), crypto, creds)
    }
  )

  ipcMain.handle(THUNDER_IPC_CHANNELS.authClear, async () => {
    clearCredentials(credentialsPath())
  })
}
