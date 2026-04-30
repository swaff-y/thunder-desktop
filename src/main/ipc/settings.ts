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
  ensureSettingsFile,
  getSetting,
  readSettings,
  setSetting,
  type ThunderSettings
} from './settings-io'

/**
 * Default Halo dev URL. Mirrors the renderer fallback in
 * `src/renderer/src/config/env.ts` so a renderer that boots with no
 * IPC channel still hits the same backend the main process would
 * write into the settings file on first launch.
 */
const DEFAULT_API_URL = 'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'

function settingsPath(): string {
  return join(app.getPath('userData'), 'thunder-desktop-settings.json')
}

function defaults(): ThunderSettings {
  return {
    apiUrl: DEFAULT_API_URL,
    downloadFolder: join(app.getPath('downloads'), 'Thunder')
  }
}

const VALID_KEYS: ReadonlyArray<keyof ThunderSettings> = ['apiUrl', 'downloadFolder', 'userAgent']

function isValidKey(key: unknown): key is keyof ThunderSettings {
  return typeof key === 'string' && (VALID_KEYS as ReadonlyArray<string>).includes(key)
}

function isValidValue(key: keyof ThunderSettings, value: unknown): boolean {
  if (key === 'userAgent') {
    return value === undefined || (typeof value === 'string' && value.length > 0)
  }
  return typeof value === 'string' && value.length > 0
}

export function registerSettingsHandlers(): void {
  // Seeds the file with defaults on first launch (and rewrites it if
  // the existing file is unparseable) so the renderer's first read
  // always returns a coherent record.
  ensureSettingsFile(settingsPath(), defaults())

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
