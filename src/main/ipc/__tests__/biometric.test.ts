/**
 * TD-094: the handlers' failure split, which is TD-093's reused. A 401
 * means the password is wrong and must be forgotten; a 5xx or no response
 * says nothing about it and must not cost the user the feature.
 *
 * Also pinned here: the opt-in cannot fail its sign-in, and the replay
 * writes the credential record through `auth-io` rather than near it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'thunder-biometric-ipc-'))
const BIOMETRIC_PATH = join(dir, 'thunder-desktop-biometric.enc')
const CREDENTIALS_PATH = join(dir, 'thunder-desktop-credentials.enc')
const API_URL = 'https://halo.example/'

const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

let platform = 'darwin'
let sensorPresent = true
let encryptionAvailable = true
let promptPasses = true

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      if (name === 'userData' || name === 'downloads') return dir
      throw new Error(`unexpected path request: ${name}`)
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
  },
  systemPreferences: {
    canPromptTouchID: () => sensorPresent,
    promptTouchID: async (): Promise<void> => {
      if (!promptPasses) throw new Error('prompt dismissed')
    }
  }
}))

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')
const { registerBiometricHandlers } = await import('../biometric')
const { resolveAuthToken } = await import('../auth')

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`handler not registered: ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

const LOGIN = { email: 'kyle@example.com', password: 'correct horse battery staple' }

function loginResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}

const SESSION = {
  data: { access_token: 'fresh-access-token', api_key: 'fresh-api-key', refresh_token: 'fresh-rt' }
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  platform = 'darwin'
  sensorPresent = true
  encryptionAvailable = true
  promptPasses = true
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  rmSync(BIOMETRIC_PATH, { force: true })
  rmSync(CREDENTIALS_PATH, { force: true })
  writeFileSync(
    join(dir, 'thunder-desktop-settings.json'),
    JSON.stringify({ apiUrl: API_URL, downloadFolder: dir, contextUrl: 'https://ctx.example/v1' })
  )
  fetchMock = vi.fn(async () => loginResponse(SESSION))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  ipcHandlers.clear()
  registerBiometricHandlers()
  await Promise.resolve()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Puts a remembered login on disk the way the opt-in would. */
async function optIn(): Promise<void> {
  await invoke(THUNDER_IPC_CHANNELS.biometricRemember, LOGIN)
}

describe('status', () => {
  it('reports a usable sensor and nothing remembered', async () => {
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricStatus)).toEqual({
      supported: true,
      remembered: false
    })
  })

  it('reports a remembered login', async () => {
    await optIn()
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricStatus)).toEqual({
      supported: true,
      remembered: true
    })
  })

  it('names the platform when this is not a Mac', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricStatus)).toEqual({
      supported: false,
      remembered: false,
      reason: 'platform'
    })
  })

  it('names the sensor when the Mac has none', async () => {
    sensorPresent = false
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricStatus)).toMatchObject({
      supported: false,
      reason: 'sensor'
    })
  })

  it('names encryption when safeStorage is unavailable', async () => {
    encryptionAvailable = false
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricStatus)).toMatchObject({
      supported: false,
      reason: 'encryption'
    })
  })
})

describe('remember', () => {
  it('prompts, then stores', async () => {
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricRemember, LOGIN)).toBe(true)
    expect(existsSync(BIOMETRIC_PATH)).toBe(true)
  })

  it('stores nothing when the prompt is dismissed', async () => {
    promptPasses = false
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricRemember, LOGIN)).toBe(false)
    expect(existsSync(BIOMETRIC_PATH)).toBe(false)
  })

  it('reports a failure rather than throwing it at a signed-in user', async () => {
    encryptionAvailable = false
    await expect(invoke(THUNDER_IPC_CHANNELS.biometricRemember, LOGIN)).resolves.toBe(false)
  })

  it('refuses a payload that is not a login', async () => {
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricRemember, { email: '' })).toBe(false)
    expect(existsSync(BIOMETRIC_PATH)).toBe(false)
  })
})

describe('unlock', () => {
  it('replays the login and returns the fresh session', async () => {
    await optIn()
    const result = await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)

    expect(result).toEqual({ ok: true, token: 'fresh-access-token', apiKey: 'fresh-api-key' })
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}v1/login`,
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('writes the credential record through auth-io', async () => {
    await optIn()
    await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)

    expect(resolveAuthToken()).toBe('fresh-access-token')
    const record = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8')) as Record<string, unknown>
    expect(record.encrypted).toBe(true)
    expect(readFileSync(CREDENTIALS_PATH, 'utf-8')).not.toContain(LOGIN.password)
  })

  it('forgets the password when Halo refuses it', async () => {
    await optIn()
    fetchMock.mockResolvedValue(loginResponse({}, 401))

    expect(await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)).toEqual({
      ok: false,
      failure: 'rejected'
    })
    expect(existsSync(BIOMETRIC_PATH)).toBe(false)
  })

  it('keeps the password on a 5xx', async () => {
    await optIn()
    fetchMock.mockResolvedValue(loginResponse({}, 503))

    expect(await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)).toEqual({
      ok: false,
      failure: 'transient'
    })
    expect(existsSync(BIOMETRIC_PATH)).toBe(true)
  })

  it('keeps the password when the request never lands', async () => {
    await optIn()
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))

    expect(await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)).toEqual({
      ok: false,
      failure: 'transient'
    })
    expect(existsSync(BIOMETRIC_PATH)).toBe(true)
  })

  it('does not replay a dismissed prompt', async () => {
    await optIn()
    promptPasses = false

    expect(await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)).toEqual({
      ok: false,
      failure: 'cancelled'
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(existsSync(BIOMETRIC_PATH)).toBe(true)
  })

  it('reports unavailable with nothing remembered', async () => {
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)).toEqual({
      ok: false,
      failure: 'unavailable'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports unavailable off darwin without prompting or replaying', async () => {
    await optIn()
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

    expect(await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)).toEqual({
      ok: false,
      failure: 'unavailable'
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('prompt and forget', () => {
  it('reports whether a human authenticated, touching no credential', async () => {
    await optIn()
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricPrompt)).toBe(true)
    expect(existsSync(BIOMETRIC_PATH)).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports a dismissal', async () => {
    promptPasses = false
    expect(await invoke(THUNDER_IPC_CHANNELS.biometricPrompt)).toBe(false)
  })

  it('deletes the remembered login', async () => {
    await optIn()
    await invoke(THUNDER_IPC_CHANNELS.biometricForget)
    expect(existsSync(BIOMETRIC_PATH)).toBe(false)
  })
})

describe('secrecy', () => {
  it('logs no password on any failure path', async () => {
    await optIn()
    fetchMock.mockResolvedValue(loginResponse({}, 503))
    await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)
    fetchMock.mockRejectedValue(new Error(`request to ${API_URL}v1/login failed`))
    await invoke(THUNDER_IPC_CHANNELS.biometricUnlock)

    const logged = [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls]
      .flat()
      .map((arg) => String(arg))
      .join(' ')
    expect(logged).not.toContain(LOGIN.password)
  })
})
