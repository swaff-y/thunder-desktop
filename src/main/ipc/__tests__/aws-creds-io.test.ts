import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearCredentials,
  getCredentials,
  hasCredentials,
  setCredentials,
  type CryptoAdapter,
  type StoredAwsCredentials
} from '../aws-creds-io'

/**
 * Stands in for Electron's `safeStorage`. The transform is reversible
 * but deliberately not the identity, so a test that accidentally reads
 * plaintext through the "encrypted" path fails loudly.
 */
function stubCrypto(available = true): CryptoAdapter {
  return {
    encrypt: (plaintext) => Buffer.from(`enc:${plaintext}`, 'utf-8'),
    decrypt: (ciphertext) => {
      const raw = ciphertext.toString('utf-8')
      if (!raw.startsWith('enc:')) throw new Error('not encrypted by this adapter')
      return raw.slice('enc:'.length)
    },
    isAvailable: () => available
  }
}

const CREDS: StoredAwsCredentials = {
  accessKeyId: 'AKIAEXAMPLE0000000000',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
}

describe('aws-creds-io (TD-052)', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'thunder-aws-creds-'))
    path = join(dir, 'thunder-desktop-aws.enc')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // ─── Round-trip ───────────────────────────────────────────────────

  it('round-trips credentials through a stubbed safeStorage', () => {
    const crypto = stubCrypto()
    expect(setCredentials(path, crypto, CREDS)).toBe(true)
    expect(getCredentials(path, crypto)).toEqual({ ...CREDS, sessionToken: undefined })
  })

  it('round-trips the optional session token when present', () => {
    const crypto = stubCrypto()
    setCredentials(path, crypto, { ...CREDS, sessionToken: 'FwoGZXIvYXdzEXAMPLE' })
    expect(getCredentials(path, crypto)?.sessionToken).toBe('FwoGZXIvYXdzEXAMPLE')
  })

  it('omits sessionToken from disk and from the read when it was never set', () => {
    setCredentials(path, stubCrypto(), CREDS)
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
    expect(raw.sessionToken).toBeUndefined()
    expect(getCredentials(path, stubCrypto())?.sessionToken).toBeUndefined()
  })

  // ─── No plaintext at rest ─────────────────────────────────────────

  it('never writes the key material in plaintext', () => {
    setCredentials(path, stubCrypto(), { ...CREDS, sessionToken: 'FwoGZXIvYXdzEXAMPLE' })
    const raw = readFileSync(path, 'utf-8')
    expect(raw).not.toContain(CREDS.accessKeyId)
    expect(raw).not.toContain(CREDS.secretAccessKey)
    expect(raw).not.toContain('FwoGZXIvYXdzEXAMPLE')
    expect(JSON.parse(raw).encrypted).toBe(true)
  })

  it.skipIf(process.platform === 'win32')(
    'writes the file 0600 so other local users cannot read the ciphertext',
    () => {
      setCredentials(path, stubCrypto(), CREDS)
      expect(statSync(path).mode & 0o777).toBe(0o600)
    }
  )

  // ─── has() ────────────────────────────────────────────────────────

  it('has() is false before a set and true after', () => {
    expect(hasCredentials(path)).toBe(false)
    setCredentials(path, stubCrypto(), CREDS)
    expect(hasCredentials(path)).toBe(true)
  })

  it('has() is false for a structurally incomplete record', () => {
    writeFileSync(path, JSON.stringify({ encrypted: true, accessKeyId: 'abc' }))
    expect(hasCredentials(path)).toBe(false)
  })

  it('has() is false for an unparseable file rather than throwing', () => {
    writeFileSync(path, '{ not json')
    expect(hasCredentials(path)).toBe(false)
  })

  it('has() does not need a crypto adapter — it must never decrypt', () => {
    setCredentials(path, stubCrypto(), CREDS)
    // Signature check: `hasCredentials` takes only a path. If it ever
    // grows a CryptoAdapter parameter, key material is being
    // materialised on a code path the IPC `has` handler can reach.
    expect(hasCredentials.length).toBe(1)
  })

  // ─── clear() ──────────────────────────────────────────────────────

  it('clear() removes the file and flips has() back to false', () => {
    setCredentials(path, stubCrypto(), CREDS)
    clearCredentials(path)
    expect(existsSync(path)).toBe(false)
    expect(hasCredentials(path)).toBe(false)
  })

  it('clear() no-ops when nothing is stored', () => {
    expect(() => clearCredentials(path)).not.toThrow()
  })

  // ─── Absent / refused reads ───────────────────────────────────────

  it('getCredentials returns null when nothing is stored', () => {
    expect(getCredentials(path, stubCrypto())).toBeNull()
  })

  it('getCredentials returns null for an unparseable file', () => {
    writeFileSync(path, '{ not json')
    expect(getCredentials(path, stubCrypto())).toBeNull()
  })

  it('refuses a record written encrypted when safeStorage is unavailable', () => {
    setCredentials(path, stubCrypto(), CREDS)
    expect(getCredentials(path, stubCrypto(false))).toBeNull()
  })

  it('refuses a plaintext record outright — this module never writes one', () => {
    writeFileSync(
      path,
      JSON.stringify({ encrypted: false, accessKeyId: 'AKIA', secretAccessKey: 'secret' })
    )
    expect(getCredentials(path, stubCrypto())).toBeNull()
  })

  it('returns null rather than garbage when decryption fails', () => {
    writeFileSync(
      path,
      JSON.stringify({
        encrypted: true,
        accessKeyId: Buffer.from('garbage').toString('base64'),
        secretAccessKey: Buffer.from('garbage').toString('base64')
      })
    )
    expect(getCredentials(path, stubCrypto())).toBeNull()
  })

  // ─── safeStorage unavailable ──────────────────────────────────────

  it('refuses to persist and writes nothing when safeStorage is unavailable', () => {
    expect(setCredentials(path, stubCrypto(false), CREDS)).toBe(false)
    expect(existsSync(path)).toBe(false)
  })

  // ─── Atomic-write semantics ───────────────────────────────────────

  it('does not leave a temp file behind after a successful write', () => {
    setCredentials(path, stubCrypto(), CREDS)
    expect(readdirSync(dir)).toEqual(['thunder-desktop-aws.enc'])
  })

  it('replaces the previous record rather than appending to it', () => {
    setCredentials(path, stubCrypto(), CREDS)
    setCredentials(path, stubCrypto(), { ...CREDS, accessKeyId: 'AKIASECOND0000000000' })
    expect(getCredentials(path, stubCrypto())?.accessKeyId).toBe('AKIASECOND0000000000')
    expect(readdirSync(dir)).toEqual(['thunder-desktop-aws.enc'])
  })
})
