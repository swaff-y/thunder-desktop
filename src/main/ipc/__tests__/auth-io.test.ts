/**
 * TD-053: `getToken` is the per-request read the halo-mcp client makes,
 * so the assertion that matters is what it does NOT touch — the api key,
 * the email, and the stored password stay sealed.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getToken, setCredentials, type CryptoAdapter } from '../auth-io'

const CREDS = {
  token: 'halo-access-token',
  apiKey: 'halo-api-key',
  email: 'kyle@example.com',
  password: 'correct horse battery staple'
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
