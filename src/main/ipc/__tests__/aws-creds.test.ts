/**
 * TD-052: integration tests for the AWS credential IPC layer.
 *
 * `electron` is mocked at the module boundary so `safeStorage` and
 * `app.getPath('userData')` can be driven from a temp directory. The
 * load-bearing assertion here is negative: the registrar must expose
 * set / clear / has and NOTHING that returns key material to the
 * renderer.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let userDataDir = ''
let encryptionAvailable = true

const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name !== 'userData') throw new Error(`unexpected path request: ${name}`)
      return userDataDir
    }
  },
  ipcMain: {
    handle: (
      channel: string,
      handler: (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
    ): void => {
      ipcHandlers.set(channel, handler)
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (plaintext: string) => Buffer.from(`enc:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => {
      const raw = ciphertext.toString('utf-8')
      if (!raw.startsWith('enc:')) throw new Error('not encrypted by this adapter')
      return raw.slice('enc:'.length)
    }
  }
}))

const { THUNDER_IPC_CHANNELS, THUNDER_ALLOWLIST } = await import('../../../preload/thunder-api')
const { registerAwsCredentialHandlers, resolveCredentials, AWS_CREDENTIALS_FILENAME } =
  await import('../aws-creds')

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`handler not registered: ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

const CREDS = {
  accessKeyId: 'AKIAEXAMPLE0000000000',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
}

describe('aws-creds (TD-052)', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'thunder-aws-'))
    encryptionAvailable = true
    ipcHandlers.clear()
    registerAwsCredentialHandlers()
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  afterAll(() => {
    vi.doUnmock('electron')
  })

  // ─── The no-getter guarantee ──────────────────────────────────────

  it('registers exactly set / clear / has — and no getter', () => {
    expect([...ipcHandlers.keys()].sort()).toEqual(
      ['thunder:aws:clear', 'thunder:aws:has', 'thunder:aws:set'].sort()
    )
  })

  it('has no aws getter channel in the IPC registry or the allowlist', () => {
    const channels = Object.values(THUNDER_IPC_CHANNELS) as string[]
    expect(channels.filter((c) => c.startsWith('thunder:aws:')).sort()).toEqual([
      'thunder:aws:clear',
      'thunder:aws:has',
      'thunder:aws:set'
    ])
    expect(THUNDER_ALLOWLIST).not.toContain('thunder:aws:get')
  })

  it('allowlists the three aws channels so the generic invoke path works', () => {
    expect(THUNDER_ALLOWLIST).toContain(THUNDER_IPC_CHANNELS.awsSet)
    expect(THUNDER_ALLOWLIST).toContain(THUNDER_IPC_CHANNELS.awsClear)
    expect(THUNDER_ALLOWLIST).toContain(THUNDER_IPC_CHANNELS.awsHas)
  })

  // ─── set / has / clear ────────────────────────────────────────────

  it('set then has reports true; clear flips it back to false', async () => {
    expect(await invoke(THUNDER_IPC_CHANNELS.awsHas)).toBe(false)
    await invoke(THUNDER_IPC_CHANNELS.awsSet, CREDS)
    expect(await invoke(THUNDER_IPC_CHANNELS.awsHas)).toBe(true)
    await invoke(THUNDER_IPC_CHANNELS.awsClear)
    expect(await invoke(THUNDER_IPC_CHANNELS.awsHas)).toBe(false)
  })

  it('clear removes the encrypted file from userData', async () => {
    const path = join(userDataDir, AWS_CREDENTIALS_FILENAME)
    await invoke(THUNDER_IPC_CHANNELS.awsSet, CREDS)
    expect(existsSync(path)).toBe(true)
    await invoke(THUNDER_IPC_CHANNELS.awsClear)
    expect(existsSync(path)).toBe(false)
  })

  it('keeps the key material out of the settings JSON', async () => {
    await invoke(THUNDER_IPC_CHANNELS.awsSet, CREDS)
    const raw = readFileSync(join(userDataDir, AWS_CREDENTIALS_FILENAME), 'utf-8')
    expect(raw).not.toContain(CREDS.secretAccessKey)
    expect(existsSync(join(userDataDir, 'thunder-desktop-settings.json'))).toBe(false)
  })

  it('trims whitespace off submitted keys before storing them', async () => {
    await invoke(THUNDER_IPC_CHANNELS.awsSet, {
      accessKeyId: `  ${CREDS.accessKeyId}\n`,
      secretAccessKey: ` ${CREDS.secretAccessKey} `
    })
    expect(resolveCredentials()).toEqual({ ...CREDS, sessionToken: undefined })
  })

  it('drops a whitespace-only session token rather than storing an empty one', async () => {
    await invoke(THUNDER_IPC_CHANNELS.awsSet, { ...CREDS, sessionToken: '   ' })
    expect(resolveCredentials()?.sessionToken).toBeUndefined()
  })

  // ─── Payload validation ───────────────────────────────────────────

  it.each([
    ['a missing secret key', { accessKeyId: 'AKIA' }],
    ['an empty access key id', { accessKeyId: '', secretAccessKey: 'secret' }],
    ['a whitespace-only access key id', { accessKeyId: '   ', secretAccessKey: 'secret' }],
    ['a non-string session token', { ...CREDS, sessionToken: 42 }],
    ['a non-object payload', 'AKIA'],
    ['null', null]
  ])('rejects %s', async (_label, payload) => {
    await expect(invoke(THUNDER_IPC_CHANNELS.awsSet, payload)).rejects.toThrow()
    expect(existsSync(join(userDataDir, AWS_CREDENTIALS_FILENAME))).toBe(false)
  })

  it('rejects the write with a legible error when safeStorage is unavailable', async () => {
    encryptionAvailable = false
    await expect(invoke(THUNDER_IPC_CHANNELS.awsSet, CREDS)).rejects.toThrow(
      /Secure storage is unavailable/
    )
    expect(existsSync(join(userDataDir, AWS_CREDENTIALS_FILENAME))).toBe(false)
  })

  // ─── resolveCredentials (main-process only) ───────────────────────

  it('resolveCredentials returns undefined when nothing is stored', () => {
    expect(resolveCredentials()).toBeUndefined()
  })

  it('resolveCredentials returns undefined after a clear', async () => {
    await invoke(THUNDER_IPC_CHANNELS.awsSet, CREDS)
    await invoke(THUNDER_IPC_CHANNELS.awsClear)
    expect(resolveCredentials()).toBeUndefined()
  })

  it('resolveCredentials returns the stored credentials, session token included', async () => {
    await invoke(THUNDER_IPC_CHANNELS.awsSet, { ...CREDS, sessionToken: 'FwoGZXIvYXdzEXAMPLE' })
    expect(resolveCredentials()).toEqual({ ...CREDS, sessionToken: 'FwoGZXIvYXdzEXAMPLE' })
  })

  it('resolveCredentials returns undefined when safeStorage stops being available', async () => {
    await invoke(THUNDER_IPC_CHANNELS.awsSet, CREDS)
    encryptionAvailable = false
    expect(resolveCredentials()).toBeUndefined()
  })
})
