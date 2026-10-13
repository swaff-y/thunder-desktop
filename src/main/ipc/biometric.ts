/**
 * TD-094: Touch ID, in main, because the password it replays must never
 * come back across IPC. The renderer asks for an unlock and receives a
 * session; the `POST v1/login` that minted it — body and all — happens
 * here.
 *
 * The guarantee is an application-level gate rather than a
 * biometric-bound key: `safeStorage` cannot set
 * `kSecAccessControlUserPresence` on the keychain entry, so code already
 * running as the user could read the ciphertext without passing the
 * prompt. Electron's own `promptTouchID` docs say so. The UI states it.
 *
 * Nothing on this path logs an error object wholesale — the replay's
 * request body *is* the password, and a thrown fetch error can carry the
 * request with it.
 */

import { app, ipcMain, safeStorage, systemPreferences } from 'electron'
import { join } from 'node:path'
import {
  THUNDER_IPC_CHANNELS,
  type ThunderBiometricStatus,
  type ThunderBiometricUnavailableReason,
  type ThunderBiometricUnlockResult
} from '../../preload/thunder-api'
import { errorMessage } from '../../shared/errors'
import { isPlainObject } from '../lib/json'
import { safeStorageCrypto, writeAuthCredentials } from './auth'
import { forget, has, recall, remember } from './biometric-store'
import { resolveApiUrl } from './settings'
import { AUTH_BIOMETRIC_FILENAME } from '../userdata-seed'

function storePath(): string {
  return join(app.getPath('userData'), AUTH_BIOMETRIC_FILENAME)
}

/**
 * One check, three ways to fail. `canPromptTouchID` is darwin-only, so
 * the platform test has to come first — and `safeStorage` is in the list
 * because a feature that cannot encrypt the password it stores is not
 * available, whatever the sensor says.
 */
function unavailableReason(): ThunderBiometricUnavailableReason | null {
  if (process.platform !== 'darwin') return 'platform'
  if (!systemPreferences.canPromptTouchID()) return 'sensor'
  if (!safeStorage.isEncryptionAvailable()) return 'encryption'
  return null
}

/** Whether a human stood at the keyboard. Never throws. */
async function promptTouchId(reason: string): Promise<boolean> {
  try {
    await systemPreferences.promptTouchID(reason)
    return true
  } catch {
    // A dismissal and a failed match are the same answer here, and the
    // thrown error says nothing worth a log line.
    return false
  }
}

interface LoginEnvelope {
  data?: {
    access_token?: unknown
    api_key?: unknown
    refresh_token?: unknown
  }
}

function isRememberRequest(value: unknown): value is { email: string; password: string } {
  if (!isPlainObject(value)) return false
  return (
    typeof value.email === 'string' &&
    value.email.length > 0 &&
    typeof value.password === 'string' &&
    value.password.length > 0
  )
}

/**
 * The replay. TD-093's failure split, reused rather than reinvented: a
 * 401 means the password is wrong, so forget it; anything else says
 * nothing about the password, so keep it.
 */
async function replayLogin(login: {
  email: string
  password: string
}): Promise<ThunderBiometricUnlockResult> {
  let response: Response
  try {
    response = await fetch(`${resolveApiUrl()}v1/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(login)
    })
  } catch {
    // Offline, DNS, timeout. Deliberately unlogged: the thrown error
    // carries the request that carried the password.
    return { ok: false, failure: 'transient' }
  }

  if (response.status === 401) {
    forget(storePath())
    return { ok: false, failure: 'rejected' }
  }
  if (!response.ok) {
    console.warn(`[biometric] replay failed with ${response.status}`)
    return { ok: false, failure: 'transient' }
  }

  let token: unknown
  let apiKey: unknown
  let refreshToken: unknown
  try {
    const body = (await response.json()) as LoginEnvelope
    token = body.data?.access_token
    apiKey = body.data?.api_key
    refreshToken = body.data?.refresh_token
  } catch {
    return { ok: false, failure: 'transient' }
  }

  if (typeof token !== 'string' || typeof apiKey !== 'string') {
    console.warn('[biometric] replay answered without a session')
    return { ok: false, failure: 'transient' }
  }

  // Through `setCredentials` like every other write, and carrying the
  // fresh refresh token — the whole point of the replay is a session
  // that survives the next 30 days without the form.
  writeAuthCredentials({
    token,
    apiKey,
    email: login.email,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : undefined
  })

  return { ok: true, token, apiKey }
}

export function registerBiometricHandlers(): void {
  ipcMain.handle(
    THUNDER_IPC_CHANNELS.biometricStatus,
    async (): Promise<ThunderBiometricStatus> => {
      const reason = unavailableReason()
      if (reason !== null) return { supported: false, remembered: false, reason }
      return { supported: true, remembered: has(storePath()) }
    }
  )

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.biometricRemember,
    async (_event, payload: unknown): Promise<boolean> => {
      if (unavailableReason() !== null || !isRememberRequest(payload)) return false
      if (!(await promptTouchId('remember your password for Touch ID sign-in'))) return false
      try {
        return remember(storePath(), safeStorageCrypto, payload)
      } catch (error) {
        // The user is already signed in. A store we couldn't write is a
        // feature that stays off, not a failed login.
        console.error('[biometric] could not store the password:', errorMessage(error))
        return false
      }
    }
  )

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.biometricUnlock,
    async (): Promise<ThunderBiometricUnlockResult> => {
      if (unavailableReason() !== null) return { ok: false, failure: 'unavailable' }
      if (!(await promptTouchId('sign in to Thunder'))) {
        return { ok: false, failure: 'cancelled' }
      }
      const login = recall(storePath(), safeStorageCrypto)
      if (login === null) return { ok: false, failure: 'unavailable' }
      return replayLogin(login)
    }
  )

  ipcMain.handle(THUNDER_IPC_CHANNELS.biometricPrompt, async (): Promise<boolean> => {
    if (unavailableReason() !== null) return false
    return promptTouchId('unlock Thunder')
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.biometricForget, async (): Promise<void> => {
    forget(storePath())
  })
}
