/**
 * TD-052: Electron wiring for the encrypted AWS credential store. The
 * pure I/O lives in `./aws-creds-io` so it stays testable outside
 * Electron; this module owns the `safeStorage` adapter, the `userData`
 * path, and the IPC surface.
 *
 * The IPC surface is set / clear / has — there is NO getter. The
 * renderer is sandboxed and untrusted with key material; the only
 * consumer of the decrypted keys is {@link resolveCredentials}, a
 * main-process export called by the Bedrock client in TD-054.
 */

import { app, ipcMain, safeStorage } from 'electron'
import { join } from 'node:path'
import { THUNDER_IPC_CHANNELS, type ThunderAwsCredentials } from '../../preload/thunder-api'
import {
  clearCredentials,
  getCredentials,
  hasCredentials,
  setCredentials,
  type CryptoAdapter,
  type StoredAwsCredentials
} from './aws-creds-io'

/** Exported so the smoke script can resolve the same file outside Electron. */
export const AWS_CREDENTIALS_FILENAME = 'thunder-desktop-aws.enc'

function credentialsPath(): string {
  return join(app.getPath('userData'), AWS_CREDENTIALS_FILENAME)
}

const crypto: CryptoAdapter = {
  encrypt: (plaintext) => safeStorage.encryptString(plaintext),
  decrypt: (ciphertext) => safeStorage.decryptString(ciphertext),
  isAvailable: () => safeStorage.isEncryptionAvailable()
}

function isValidAwsPayload(value: unknown): value is ThunderAwsCredentials {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.accessKeyId !== 'string' || v.accessKeyId.length === 0) return false
  if (typeof v.secretAccessKey !== 'string' || v.secretAccessKey.length === 0) return false
  if (v.sessionToken !== undefined && typeof v.sessionToken !== 'string') return false
  return true
}

/**
 * Main-process only. Returns the stored credentials, or `undefined`
 * when none are stored — `undefined` is meaningful to the AWS SDK
 * (and to `@anthropic-ai/bedrock-sdk`), which then falls through to its
 * default provider chain: env vars, `~/.aws/credentials`, SSO, instance
 * role.
 */
export function resolveCredentials(): StoredAwsCredentials | undefined {
  return getCredentials(credentialsPath(), crypto) ?? undefined
}

export function registerAwsCredentialHandlers(): void {
  ipcMain.handle(THUNDER_IPC_CHANNELS.awsSet, async (_event, payload: unknown) => {
    if (!isValidAwsPayload(payload)) {
      throw new Error('Invalid AWS credentials payload')
    }
    const trimmed: StoredAwsCredentials = {
      accessKeyId: payload.accessKeyId.trim(),
      secretAccessKey: payload.secretAccessKey.trim(),
      ...(payload.sessionToken !== undefined &&
        payload.sessionToken.trim().length > 0 && {
          sessionToken: payload.sessionToken.trim()
        })
    }
    if (trimmed.accessKeyId.length === 0 || trimmed.secretAccessKey.length === 0) {
      throw new Error('Invalid AWS credentials payload')
    }
    if (!setCredentials(credentialsPath(), crypto, trimmed)) {
      throw new Error('Secure storage is unavailable on this system — credentials were not saved.')
    }
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.awsClear, async () => {
    clearCredentials(credentialsPath())
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.awsHas, async () => {
    return hasCredentials(credentialsPath())
  })
}
