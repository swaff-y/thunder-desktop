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

/**
 * TD-033 rule, applied to the TD-052 fields: trim first, then treat an
 * empty result as absent. A whitespace-only value persisted from a
 * fat-fingered Settings save would otherwise be handed to the Bedrock
 * client verbatim and fail as an unhelpful 400.
 */
function coerceTrimmed(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function coerce(partial: Partial<ThunderSettings>, defaults: ThunderSettings): ThunderSettings {
  const out: ThunderSettings = {
    apiUrl: typeof partial.apiUrl === 'string' && partial.apiUrl.length > 0
      ? partial.apiUrl
      : defaults.apiUrl,
    downloadFolder: typeof partial.downloadFolder === 'string' && partial.downloadFolder.length > 0
      ? partial.downloadFolder
      : defaults.downloadFolder,
    mcpUrl: coerceTrimmed(partial.mcpUrl, defaults.mcpUrl),
    bedrockRegion: coerceTrimmed(partial.bedrockRegion, defaults.bedrockRegion),
    bedrockModelId: coerceTrimmed(partial.bedrockModelId, defaults.bedrockModelId),
    chatEnabled:
      typeof partial.chatEnabled === 'boolean' ? partial.chatEnabled : defaults.chatEnabled
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
 * The string-valued settings a migration may rewrite.
 *
 * TD-064 widened this past URLs to the Bedrock pair. Deliberately not
 * `keyof ThunderSettings`: `chatEnabled` is a boolean the user toggles,
 * and `downloadFolder` is a path they picked — neither has a
 * "previously shipped default" worth rewriting.
 */
type MigratableSettingKey = 'apiUrl' | 'mcpUrl' | 'bedrockRegion' | 'bedrockModelId'

/**
 * TD-029: one-time migration. If the stored value at `key` exactly
 * matches any value in `legacyValues`, rewrite it to `defaults[key]`.
 * Any other stored value (including custom overrides set via the
 * Settings modal) is left alone.
 *
 * Idempotent: a second run is a no-op because the rewritten value no
 * longer matches the legacy list. Safe to call on every launch.
 *
 * No-ops cleanly when the file is missing or unparseable —
 * `ensureSettingsFile` handles those cases on the same call site.
 *
 * TD-066 generalised this from an `apiUrl`-only helper, and TD-064
 * widened it past URLs. Every one of these fields needs the identical
 * treatment for the identical reason — a persisted file means a new
 * shipped default would otherwise only ever reach a machine that has
 * never launched the app.
 */
export function migrateSetting(
  filePath: string,
  defaults: ThunderSettings,
  key: MigratableSettingKey,
  legacyValues: ReadonlyArray<string>
): void {
  const parsed = parseFile(filePath)
  if (!parsed) return
  const stored = parsed[key]
  if (typeof stored !== 'string') return
  if (!legacyValues.includes(stored)) return
  // Re-coerce to fill in any other missing fields with current
  // defaults — a partial file from an older schema version shouldn't
  // be left half-populated by the rewrite.
  const next = coerce({ ...parsed, [key]: defaults[key] }, defaults)
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
