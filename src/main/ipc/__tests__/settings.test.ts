/**
 * TD-052: main-side validation for the settings IPC handlers.
 *
 * The Settings modal validates before it saves, but the renderer is
 * sandboxed and untrusted — anything holding a `window.thunder` handle
 * can call `settings.set` directly. These tests pin the checks that
 * survive a hostile caller.
 *
 * `settings.ts` memoises its path and defaults on first access, so the
 * temp directory is created once for the whole file rather than
 * per-test.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'thunder-settings-ipc-'))

const ipcHandlers = new Map<
  string,
  (event: unknown, ...args: unknown[]) => unknown | Promise<unknown>
>()

vi.mock('electron', () => ({
  app: {
    // TD-060: these tests stand in for an unpackaged (`npm run dev`)
    // launch, so the apiUrl default resolves to the dev backend.
    isPackaged: false,
    getPath: (name: string) => {
      if (name === 'userData') return dir
      if (name === 'downloads') return dir
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
  }
}))

const { THUNDER_IPC_CHANNELS } = await import('../../../preload/thunder-api')
const { registerSettingsHandlers } = await import('../settings')

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`handler not registered: ${channel}`)
  return Promise.resolve(handler({}, ...args))
}

const setSetting = (key: string, value: unknown): Promise<unknown> =>
  invoke(THUNDER_IPC_CHANNELS.settingsSet, key, value)

describe('settings IPC validation (TD-052)', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    try {
      unlinkSync(join(dir, 'thunder-desktop-settings.json'))
    } catch {
      // First run — nothing to clear.
    }
    registerSettingsHandlers()
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.doUnmock('electron')
  })

  // ─── Key allowlist ────────────────────────────────────────────────

  it('rejects a key that is not part of the settings schema', async () => {
    await expect(setSetting('__proto__', 'x')).rejects.toThrow(/unknown key/)
    await expect(setSetting('awsSecretAccessKey', 'x')).rejects.toThrow(/unknown key/)
  })

  it('accepts every key in the schema', async () => {
    await expect(setSetting('apiUrl', 'https://halo.example/')).resolves.toBeUndefined()
    await expect(setSetting('downloadFolder', '/tmp/Thunder')).resolves.toBeUndefined()
    await expect(setSetting('userAgent', 'UA/1.0')).resolves.toBeUndefined()
    await expect(setSetting('contextUrl', 'https://ctx.example/v1')).resolves.toBeUndefined()
  })

  // ─── chatEnabled is a boolean, and `false` is a real value ────────

  it('accepts both boolean values for chatEnabled', async () => {
    await expect(setSetting('chatEnabled', true)).resolves.toBeUndefined()
    await expect(setSetting('chatEnabled', false)).resolves.toBeUndefined()
    expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'chatEnabled')).toBe(false)
  })

  it('rejects a non-boolean chatEnabled', async () => {
    await expect(setSetting('chatEnabled', 'true')).rejects.toThrow(/invalid value/)
    await expect(setSetting('chatEnabled', 1)).rejects.toThrow(/invalid value/)
  })

  // ─── contextUrl scheme check ──────────────────────────────────────

  it.each([
    ['a file: URL', 'file:///etc/passwd'],
    ['a data: URL', 'data:text/plain,hi'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a bare hostname', 'thunder-context.example'],
    ['an empty string', ''],
    ['a non-string', 42]
  ])(
    'rejects %s for contextUrl — main must not trust the renderer check',
    async (_label, value) => {
      await expect(setSetting('contextUrl', value)).rejects.toThrow(/invalid value/)
    }
  )

  it.each(['https://thunder-context.example/v1', 'http://localhost:3000/v1'])(
    'accepts %s for contextUrl',
    async (value) => {
      await expect(setSetting('contextUrl', value)).resolves.toBeUndefined()
      expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'contextUrl')).toBe(value)
    }
  )

  // ─── Defaults ─────────────────────────────────────────────────────

  it('seeds chatEnabled false so nothing about Home changes yet', async () => {
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    expect(all.chatEnabled).toBe(false)
  })

  it('seeds the AI chat defaults on first launch', async () => {
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    // TD-065: unpackaged, so the context URL follows `apiUrl` to the dev
    // account.
    expect(all.contextUrl).toBe('https://thunder-context-dev.swaff.name/v1')
  })

  // ─── Dev backend (TD-060) ─────────────────────────────────────────

  it('seeds the dev backend on an unpackaged first launch', async () => {
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    expect(all.apiUrl).toBe('https://halo-dev.swaff.name/')
  })

  // Without this the new default would only reach machines that have
  // never launched the app — every existing dev box has a settings
  // file pinned to prod from before the change.
  it('flips an untouched prod default to dev on an unpackaged launch', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({ apiUrl: 'https://halo.swaff.name/' })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'apiUrl')).toBe(
      'https://halo-dev.swaff.name/'
    )
  })

  it('leaves a hand-set apiUrl alone', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({ apiUrl: 'https://halo.example/custom/' })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'apiUrl')).toBe(
      'https://halo.example/custom/'
    )
  })

  // ─── Dev thunder-context (TD-065) ─────────────────────────────────

  // The TD-066 bug, in its new clothes: a settings file that pairs a dev
  // `apiUrl` with the prod context URL 401s on every question, because
  // the service forwards the caller's Halo token.
  it('flips an untouched prod context default to dev on an unpackaged launch', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({
        apiUrl: 'https://halo-dev.swaff.name/',
        contextUrl: 'https://thunder-context.swaff.name/v1'
      })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'contextUrl')).toBe(
      'https://thunder-context-dev.swaff.name/v1'
    )
  })

  it('leaves a hand-set contextUrl alone', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({ contextUrl: 'http://localhost:8787/v1' })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'contextUrl')).toBe(
      'http://localhost:8787/v1'
    )
  })

  // ─── The cutover migration (TD-065) ───────────────────────────────

  it('replaces the three retired keys with a contextUrl on an upgraded machine', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({
        apiUrl: 'https://halo-dev.swaff.name/',
        mcpUrl: 'https://halo-mcp-dev.swaff.name/mcp',
        bedrockRegion: 'us-east-1',
        bedrockModelId: 'anthropic.claude-sonnet-5'
      })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    expect(all).not.toHaveProperty('mcpUrl')
    expect(all).not.toHaveProperty('bedrockRegion')
    expect(all).not.toHaveProperty('bedrockModelId')
    expect(all.contextUrl).toBe('https://thunder-context-dev.swaff.name/v1')
    await expect(setSetting('mcpUrl', 'https://x.example/mcp')).rejects.toThrow(/unknown key/)
  })

  // A halo-mcp endpoint is not a thunder-context one — carrying a
  // hand-typed one across would point the chat at a URL that answers
  // nothing, and the user would have no idea where it came from.
  it('does not resurrect a hand-typed mcpUrl as the contextUrl', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({ mcpUrl: 'http://localhost:8787/mcp' })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'contextUrl')).toBe(
      'https://thunder-context-dev.swaff.name/v1'
    )
  })

  it('lands apiUrl and contextUrl on the same environment after a launch', async () => {
    writeFileSync(
      join(dir, 'thunder-desktop-settings.json'),
      JSON.stringify({
        apiUrl: 'https://halo.swaff.name/',
        contextUrl: 'https://thunder-context.swaff.name/v1'
      })
    )
    ipcHandlers.clear()
    registerSettingsHandlers()
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    expect(all.apiUrl).toBe('https://halo-dev.swaff.name/')
    expect(all.contextUrl).toBe('https://thunder-context-dev.swaff.name/v1')
  })
})
