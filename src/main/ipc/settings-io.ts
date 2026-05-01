/**
 * TD-018: pure settings I/O — reads/writes a JSON settings file at
 * `<userData>/thunder-desktop-settings.json`. Kept free of the
 * `electron` import so it stays unit-testable under vitest's node
 * environment, mirroring the auth-io / window-state split.
 *
 * Atomic writes: every write goes to a temp file in the same directory
 * and then `rename()`s into place. Rename is atomic on POSIX and
 * ReplaceFile-backed on Win32, so a crash mid-write can either leave
 * the previous file intact or the new file fully written — never a
 * half-written file the next launch would refuse to parse.
 *
 * Read path is forgiving: a missing or unparseable file falls back to
 * the supplied defaults rather than throwing, so a corrupt settings
 * file never bricks the app.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ThunderSettings } from '../../shared/settings'

export type { ThunderSettings }

function parseFile(filePath: string): Partial<ThunderSettings> | null {
  try {
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as Partial<ThunderSettings>
  } catch {
    return null
  }
}

function coerce(partial: Partial<ThunderSettings>, defaults: ThunderSettings): ThunderSettings {
  const out: ThunderSettings = {
    apiUrl: typeof partial.apiUrl === 'string' && partial.apiUrl.length > 0
      ? partial.apiUrl
      : defaults.apiUrl,
    downloadFolder: typeof partial.downloadFolder === 'string' && partial.downloadFolder.length > 0
      ? partial.downloadFolder
      : defaults.downloadFolder
  }
  if (typeof partial.userAgent === 'string' && partial.userAgent.length > 0) {
    out.userAgent = partial.userAgent
  } else if (defaults.userAgent !== undefined) {
    out.userAgent = defaults.userAgent
  }
  return out
}

export function writeSettingsFile(filePath: string, settings: ThunderSettings): void {
  const content = JSON.stringify(settings, null, 2)
  // Temp file lives in the same directory so `renameSync` stays on a
  // single filesystem (cross-device renames fall back to copy+unlink,
  // which is no longer atomic). The PID + timestamp suffix avoids
  // collisions if two main-process writes ever race.
  const tmpPath = join(
    dirname(filePath),
    `.thunder-desktop-settings-${process.pid}-${Date.now()}.tmp`
  )
  writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 })
  renameSync(tmpPath, filePath)
}

export function readSettings(filePath: string, defaults: ThunderSettings): ThunderSettings {
  const parsed = parseFile(filePath)
  if (!parsed) return defaults
  return coerce(parsed, defaults)
}

/**
 * Ensures the settings file exists on disk, writing defaults if it
 * doesn't (or if it exists but is unparseable — better to overwrite
 * the corrupt file than leave it festering).
 */
export function ensureSettingsFile(filePath: string, defaults: ThunderSettings): void {
  if (!existsSync(filePath)) {
    writeSettingsFile(filePath, defaults)
    return
  }
  if (parseFile(filePath) === null) {
    writeSettingsFile(filePath, defaults)
  }
}

/**
 * TD-029: one-time migration. If the stored `apiUrl` exactly matches
 * any value in `legacyApiUrls`, rewrite it to `defaults.apiUrl`. Any
 * other stored value (including custom overrides set via the
 * Settings modal) is left alone.
 *
 * Idempotent: a second run is a no-op because the rewritten value no
 * longer matches the legacy list. Safe to call on every launch.
 *
 * No-ops cleanly when the file is missing or unparseable —
 * `ensureSettingsFile` handles those cases on the same call site.
 */
export function migrateApiUrl(
  filePath: string,
  defaults: ThunderSettings,
  legacyApiUrls: ReadonlyArray<string>
): void {
  const parsed = parseFile(filePath)
  if (!parsed) return
  if (typeof parsed.apiUrl !== 'string') return
  if (!legacyApiUrls.includes(parsed.apiUrl)) return
  // Re-coerce to fill in any other missing fields with current
  // defaults — a partial file from an older schema version shouldn't
  // be left half-populated by the rewrite.
  const next = coerce({ ...parsed, apiUrl: defaults.apiUrl }, defaults)
  writeSettingsFile(filePath, next)
}

export function writeSettings(
  filePath: string,
  defaults: ThunderSettings,
  partial: Partial<ThunderSettings>
): ThunderSettings {
  const current = readSettings(filePath, defaults)
  const next = coerce({ ...current, ...partial }, defaults)
  writeSettingsFile(filePath, next)
  return next
}

export function getSetting<K extends keyof ThunderSettings>(
  filePath: string,
  defaults: ThunderSettings,
  key: K
): ThunderSettings[K] {
  return readSettings(filePath, defaults)[key]
}

export function setSetting<K extends keyof ThunderSettings>(
  filePath: string,
  defaults: ThunderSettings,
  key: K,
  value: ThunderSettings[K]
): ThunderSettings {
  return writeSettings(filePath, defaults, { [key]: value } as Partial<ThunderSettings>)
}
