/**
 * TD-094: the remembered-password store. The assertions that matter are
 * the refusals — a password written in the clear, or read back on a
 * machine that can no longer decrypt it, is worse than the feature being
 * unavailable.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { forget, has, recall, remember, type CryptoAdapter } from '../biometric-store'

const LOGIN = { email: 'kyle@example.com', password: 'correct horse battery staple' }

let dir = ''
let path = ''
let encryptionAvailable = true
let crypto: CryptoAdapter

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thunder-biometric-'))
  path = join(dir, 'biometric.enc')
  encryptionAvailable = true
  crypto = {
    encrypt: (plaintext) => Buffer.from(`enc:${plaintext}`, 'utf-8'),
    decrypt: (ciphertext) => {
      const raw = ciphertext.toString('utf-8')
      if (!raw.startsWith('enc:')) throw new Error('not encrypted by this adapter')
      return raw.slice('enc:'.length)
    },
    isAvailable: () => encryptionAvailable
  }
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('remember / recall', () => {
  it('round-trips the login encrypted', () => {
    expect(remember(path, crypto, LOGIN)).toBe(true)
    expect(recall(path, crypto)).toEqual(LOGIN)
  })

  it('writes neither the email nor the password in the clear', () => {
    remember(path, crypto, LOGIN)
    const raw = readFileSync(path, 'utf-8')
    expect(raw).not.toContain(LOGIN.password)
    expect(raw).not.toContain(LOGIN.email)
    expect(JSON.parse(raw)).toMatchObject({ encrypted: true })
  })

  it('writes the file 0600', () => {
    remember(path, crypto, LOGIN)
    expect(statSync(path).mode & 0o777).toBe(0o600)
  })

  it('refuses to write without safeStorage', () => {
    encryptionAvailable = false
    expect(remember(path, crypto, LOGIN)).toBe(false)
    expect(existsSync(path)).toBe(false)
  })

  it('refuses to read a record it can no longer decrypt', () => {
    remember(path, crypto, LOGIN)
    encryptionAvailable = false
    expect(recall(path, crypto)).toBeNull()
  })

  it('returns null rather than throwing on an undecryptable record', () => {
    writeFileSync(path, JSON.stringify({ encrypted: true, email: 'bm8=', password: 'bm8=' }))
    expect(recall(path, crypto)).toBeNull()
  })

  it('returns null when nothing is stored', () => {
    expect(recall(path, crypto)).toBeNull()
  })
})

describe('has / forget', () => {
  it('reports a stored record without decrypting it', () => {
    expect(has(path)).toBe(false)
    remember(path, crypto, LOGIN)
    expect(has(path)).toBe(true)
  })

  it('ignores a half-written record', () => {
    writeFileSync(path, JSON.stringify({ encrypted: true, email: 'enc:kyle@example.com' }))
    expect(has(path)).toBe(false)
  })

  it('deletes the file rather than emptying it', () => {
    remember(path, crypto, LOGIN)
    forget(path)
    expect(existsSync(path)).toBe(false)
    expect(has(path)).toBe(false)
  })

  it('is a no-op when there is nothing to forget', () => {
    expect(() => forget(path)).not.toThrow()
  })
})
