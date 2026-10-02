/**
 * TD-053: `getToken` is the per-request read the halo-mcp client makes,
 * so the assertion that matters is what it does NOT touch — the api key,
 * the email, and the stored refresh token stay sealed.
 *
 * TD-093: and the credential at rest is a refresh token rather than the
 * user's password, encrypted when safeStorage will have it and dropped
 * entirely when it won't.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getCredentials,
  getToken,
  setCredentials,
  type CryptoAdapter,
  type MigratableCredentials
} from '../auth-io'

const CREDS = {
  token: 'halo-access-token',
  apiKey: 'halo-api-key',
  email: 'kyle@example.com',
  refreshToken: 'halo-refresh-token'
}

function onDisk(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

let dir = ''
let path = ''
let encryptionAvailable = true
let decrypt: Mock<(ciphertext: Buffer) => string>
let crypto: CryptoAdapter

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thunder-auth-io-'))
  path = join(dir, 'credentials.enc')
  encryptionAvailable = true
  decrypt = vi.fn((ciphertext: Buffer) => {
    const raw = ciphertext.toString('utf-8')
    if (!raw.startsWith('enc:')) throw new Error('not encrypted by this adapter')
    return raw.slice('enc:'.length)
  })
  crypto = {
    encrypt: (plaintext) => Buffer.from(`enc:${plaintext}`, 'utf-8'),
    decrypt: (ciphertext) => decrypt(ciphertext),
    isAvailable: () => encryptionAvailable
  }
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('getToken (TD-053)', () => {
  it('returns the decrypted token', () => {
    setCredentials(path, crypto, CREDS)
    expect(getToken(path, crypto)).toBe(CREDS.token)
  })

  it('decrypts the token and nothing else', () => {
    setCredentials(path, crypto, CREDS)
    getToken(path, crypto)
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('returns null when no credentials have been stored', () => {
    expect(getToken(path, crypto)).toBeNull()
  })

  it('honours a legacy plaintext record', () => {
    encryptionAvailable = false
    setCredentials(path, crypto, CREDS)
    expect(getToken(path, crypto)).toBe(CREDS.token)
    expect(decrypt).not.toHaveBeenCalled()
  })

  it('refuses an encrypted record once safeStorage stops being available', () => {
    setCredentials(path, crypto, CREDS)
    encryptionAvailable = false
    expect(getToken(path, crypto)).toBeNull()
  })

  it('returns null when the ciphertext cannot be decrypted', () => {
    setCredentials(path, crypto, CREDS)
    decrypt.mockImplementation(() => {
      throw new Error('keychain rejected the ciphertext')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(getToken(path, crypto)).toBeNull()
  })
})

describe('refresh token at rest (TD-093)', () => {
  it('round-trips the refresh token through the crypto adapter', () => {
    setCredentials(path, crypto, CREDS)
    expect(getCredentials(path, crypto)).toMatchObject({
      token: CREDS.token,
      apiKey: CREDS.apiKey,
      email: CREDS.email,
      refreshToken: CREDS.refreshToken
    })
  })

  it('never writes the refresh token in the clear', () => {
    setCredentials(path, crypto, CREDS)
    expect(onDisk(path).refreshToken).toBe(
      Buffer.from(`enc:${CREDS.refreshToken}`, 'utf-8').toString('base64')
    )
  })

  it('writes no password field, whatever an IPC payload carries', () => {
    // The type forbids it; `isValidAuthPayload` lets unknown keys through,
    // so the write path has to drop it at runtime too.
    const payload: MigratableCredentials = { ...CREDS, password: 'correct horse battery staple' }
    setCredentials(path, crypto, payload)
    expect(onDisk(path)).not.toHaveProperty('password')
  })

  it('omits the refresh token when safeStorage is unavailable', () => {
    encryptionAvailable = false
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setCredentials(path, crypto, CREDS)

    const entry = onDisk(path)
    expect(entry).not.toHaveProperty('refreshToken')
    expect(entry).toMatchObject({ encrypted: false, token: CREDS.token, email: CREDS.email })
    expect(warn.mock.calls[0]?.[0]).toContain('refusing to persist refresh token')
  })

  it('omits it from the record a read hands back too', () => {
    encryptionAvailable = false
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    setCredentials(path, crypto, CREDS)
    expect(getCredentials(path, crypto)?.refreshToken).toBeUndefined()
  })

  it('decrypts the token alone even with a refresh token in the record', () => {
    setCredentials(path, crypto, CREDS)
    expect(getToken(path, crypto)).toBe(CREDS.token)
    expect(decrypt).toHaveBeenCalledTimes(1)
  })

  it('surfaces a pre-TD-093 password so the migration can trade it in', () => {
    // Hand-write the record a TD-030 build left behind: no refresh token,
    // the password encrypted beside the rest.
    const legacy = {
      encrypted: true,
      token: crypto.encrypt(CREDS.token).toString('base64'),
      apiKey: crypto.encrypt(CREDS.apiKey).toString('base64'),
      email: crypto.encrypt(CREDS.email).toString('base64'),
      password: crypto.encrypt('correct horse battery staple').toString('base64')
    }
    writeFileSync(path, JSON.stringify(legacy), 'utf-8')

    const read = getCredentials(path, crypto)
    expect(read?.password).toBe('correct horse battery staple')
    expect(read?.refreshToken).toBeUndefined()
  })

  it('names the field rather than dumping the record when a decrypt fails', () => {
    setCredentials(path, crypto, CREDS)
    decrypt.mockImplementation(() => {
      throw new Error('keychain rejected the ciphertext')
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(getCredentials(path, crypto)).toBeNull()

    const logged = error.mock.calls[0] ?? []
    expect(logged[1]).toBe('keychain rejected the ciphertext')
    expect(logged.every((arg) => typeof arg === 'string')).toBe(true)
  })
})
