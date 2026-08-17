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
    await expect(setSetting('bedrockRegion', 'us-west-2')).resolves.toBeUndefined()
    await expect(setSetting('bedrockModelId', 'global.anthropic.x')).resolves.toBeUndefined()
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

  // ─── mcpUrl scheme check ──────────────────────────────────────────

  it.each([
    ['a file: URL', 'file:///etc/passwd'],
    ['a data: URL', 'data:text/plain,hi'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a bare hostname', 'halo-mcp.example'],
    ['an empty string', ''],
    ['a non-string', 42]
  ])('rejects %s for mcpUrl — main must not trust the renderer check', async (_label, value) => {
    await expect(setSetting('mcpUrl', value)).rejects.toThrow(/invalid value/)
  })

  it.each(['https://halo-mcp.example/mcp', 'http://localhost:3000/mcp'])(
    'accepts %s for mcpUrl',
    async (value) => {
      await expect(setSetting('mcpUrl', value)).resolves.toBeUndefined()
      expect(await invoke(THUNDER_IPC_CHANNELS.settingsGet, 'mcpUrl')).toBe(value)
    }
  )

  // ─── Defaults ─────────────────────────────────────────────────────

  it('seeds chatEnabled false so nothing about Home changes yet', async () => {
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    expect(all.chatEnabled).toBe(false)
  })

  it('seeds the AI chat defaults on first launch', async () => {
    const all = (await invoke(THUNDER_IPC_CHANNELS.settingsGetAll)) as Record<string, unknown>
    expect(all.mcpUrl).toBe('https://halo-mcp.swaff.name/mcp')
    expect(all.bedrockRegion).toBe('ap-south-1')
    expect(all.bedrockModelId).toBe('global.anthropic.claude-sonnet-5')
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
})
