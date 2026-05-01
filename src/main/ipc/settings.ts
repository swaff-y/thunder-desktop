/**
 * TD-018: registers IPC handlers for the JSON settings store and
 * resolves the on-disk file path / defaults from Electron paths. The
 * pure I/O surface lives in `./settings-io` so this module — and its
 * `app.getPath` calls — stay out of vitest's node environment.
 */

import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'
import {
  DEFAULT_API_URL,
  LEGACY_DEV_API_URL,
  type ThunderSettings
} from '../../shared/settings'
import {
  ensureSettingsFile,
  getSetting,
  migrateApiUrl,
  readSettings,
  setSetting
} from './settings-io'

// Memoised after first access. `app.getPath()` is cheap, but we hit
// these on every IPC invocation and the values can't change after
// `app.whenReady()` — so cache them at first read. The lazy form
// (rather than top-level constants) is required because `app.getPath`
// throws if called before `app.whenReady()`.
let cachedPath: string | null = null
let cachedDefaults: ThunderSettings | null = null

function settingsPath(): string {
  if (cachedPath === null) {
    cachedPath = join(app.getPath('userData'), 'thunder-desktop-settings.json')
  }
  return cachedPath
}

function defaults(): ThunderSettings {
  if (cachedDefaults === null) {
    cachedDefaults = {
      apiUrl: DEFAULT_API_URL,
      downloadFolder: join(app.getPath('downloads'), 'Thunder')
    }
  }
  return cachedDefaults
}

const VALID_KEYS: ReadonlyArray<keyof ThunderSettings> = ['apiUrl', 'downloadFolder', 'userAgent']

function isValidKey(key: unknown): key is keyof ThunderSettings {
  return typeof key === 'string' && (VALID_KEYS as ReadonlyArray<string>).includes(key)
}

// All persistable values are non-empty strings. `userAgent` is optional
// in the schema, but "absent" means the key isn't present at all — IPC
// drops `undefined` arguments anyway, so we don't try to support
// `set('userAgent', undefined)` as a clear path. A dedicated
// `settings:clear` channel would be the right shape if that's ever
// needed.
function isValidValue(_key: keyof ThunderSettings, value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

export function registerSettingsHandlers(): void {
  // Seeds the file with defaults on first launch (and rewrites it if
  // the existing file is unparseable) so the renderer's first read
  // always returns a coherent record.
  ensureSettingsFile(settingsPath(), defaults())
  // TD-029: rewrite the dev API URL to the prod default for users
  // upgrading from a build that shipped the old default. Idempotent —
  // a no-op once the value has been rewritten or if the user set a
  // custom override.
  migrateApiUrl(settingsPath(), defaults(), [LEGACY_DEV_API_URL])

  ipcMain.handle(THUNDER_IPC_CHANNELS.settingsGetAll, async () => {
    return readSettings(settingsPath(), defaults())
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.settingsGet, async (_event, key: unknown) => {
    if (!isValidKey(key)) {
      throw new Error(`[settings] unknown key: ${String(key)}`)
    }
    return getSetting(settingsPath(), defaults(), key)
  })

  ipcMain.handle(THUNDER_IPC_CHANNELS.settingsSet, async (_event, key: unknown, value: unknown) => {
    if (!isValidKey(key)) {
      throw new Error(`[settings] unknown key: ${String(key)}`)
    }
    if (!isValidValue(key, value)) {
      throw new Error(`[settings] invalid value for ${key}`)
    }
    setSetting(settingsPath(), defaults(), key, value as ThunderSettings[typeof key])
  })
}
