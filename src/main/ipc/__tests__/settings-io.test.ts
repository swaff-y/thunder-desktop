import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureSettingsFile,
  getSetting,
  migrateApiUrl,
  readSettings,
  setSetting,
  writeSettings,
  writeSettingsFile,
  type ThunderSettings
} from '../settings-io'

const DEFAULTS: ThunderSettings = {
  apiUrl: 'https://halo.example/dev/',
  downloadFolder: '/tmp/Thunder'
}

describe('settings-io (TD-018)', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'thunder-settings-'))
    path = join(dir, 'thunder-desktop-settings.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // ─── Defaults / fallback ──────────────────────────────────────────

  it('returns defaults when no file exists', () => {
    expect(readSettings(path, DEFAULTS)).toEqual(DEFAULTS)
  })

  it('returns defaults when the file is corrupted JSON rather than throwing', () => {
    writeFileSync(path, '{ this is not json !!')
    expect(readSettings(path, DEFAULTS)).toEqual(DEFAULTS)
  })

  it('returns defaults when the file parses but is not an object', () => {
    writeFileSync(path, '"just-a-string"')
    expect(readSettings(path, DEFAULTS)).toEqual(DEFAULTS)
  })

  it('falls back to default per-key for missing or empty values', () => {
    writeFileSync(path, JSON.stringify({ apiUrl: '' }))
    const settings = readSettings(path, DEFAULTS)
    expect(settings.apiUrl).toBe(DEFAULTS.apiUrl)
    expect(settings.downloadFolder).toBe(DEFAULTS.downloadFolder)
  })

  // ─── Round-trip ───────────────────────────────────────────────────

  it('round-trips a fully-populated record via write → read', () => {
    const settings: ThunderSettings = {
      apiUrl: 'https://staging.halo.example/',
      downloadFolder: '/Users/test/Downloads/Thunder',
      userAgent: 'CustomUA/1.0'
    }
    writeSettingsFile(path, settings)
    expect(readSettings(path, DEFAULTS)).toEqual(settings)
  })

  it('omits userAgent from the read result when it was never set and defaults have none', () => {
    writeSettingsFile(path, DEFAULTS)
    const settings = readSettings(path, DEFAULTS)
    expect(settings.userAgent).toBeUndefined()
  })

  // ─── Per-key getters / setters ────────────────────────────────────

  it('getSetting returns the stored apiUrl', () => {
    writeSettingsFile(path, { ...DEFAULTS, apiUrl: 'https://test/' })
    expect(getSetting(path, DEFAULTS, 'apiUrl')).toBe('https://test/')
  })

  it('setSetting updates a single key without clobbering the others', () => {
    writeSettingsFile(path, {
      apiUrl: 'https://a/',
      downloadFolder: '/Users/test/Downloads/Thunder'
    })
    setSetting(path, DEFAULTS, 'apiUrl', 'https://b/')
    const after = readSettings(path, DEFAULTS)
    expect(after.apiUrl).toBe('https://b/')
    expect(after.downloadFolder).toBe('/Users/test/Downloads/Thunder')
  })

  it('writeSettings merges a partial over the existing record', () => {
    writeSettingsFile(path, DEFAULTS)
    const next = writeSettings(path, DEFAULTS, { apiUrl: 'https://merged/' })
    expect(next.apiUrl).toBe('https://merged/')
    expect(next.downloadFolder).toBe(DEFAULTS.downloadFolder)
  })

  // ─── ensureSettingsFile ───────────────────────────────────────────

  it('ensureSettingsFile writes defaults when no file exists', () => {
    ensureSettingsFile(path, DEFAULTS)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(DEFAULTS)
  })

  it('ensureSettingsFile leaves a valid existing file alone', () => {
    const existing: ThunderSettings = {
      apiUrl: 'https://existing/',
      downloadFolder: '/Users/test/Downloads/Thunder'
    }
    writeSettingsFile(path, existing)
    ensureSettingsFile(path, DEFAULTS)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(existing)
  })

  it('ensureSettingsFile overwrites an unparseable file with defaults', () => {
    writeFileSync(path, '{ not json')
    ensureSettingsFile(path, DEFAULTS)
    expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(DEFAULTS)
  })

  // ─── Atomic-write semantics ───────────────────────────────────────

  it('writes valid JSON to the final path', () => {
    writeSettingsFile(path, DEFAULTS)
    const raw = readFileSync(path, 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
    expect(JSON.parse(raw)).toEqual(DEFAULTS)
  })

  it('does not leave a temp file behind after a successful write', () => {
    writeSettingsFile(path, DEFAULTS)
    const stragglers = readdirSync(dir).filter((name) => name.endsWith('.tmp'))
    expect(stragglers).toEqual([])
  })

  it('writes to a temp path in the same directory before renaming', () => {
    // The atomic-rename guarantee depends on the temp file living on
    // the same filesystem as the target. Easiest way to verify the
    // contract: the only file in the directory after the write is the
    // target file (no cross-directory tmp dance).
    writeSettingsFile(path, DEFAULTS)
    expect(readdirSync(dir)).toEqual(['thunder-desktop-settings.json'])
  })

  it('preserves the previous file when the new write replaces it (rename, not append)', () => {
    writeSettingsFile(path, { ...DEFAULTS, apiUrl: 'https://first/' })
    writeSettingsFile(path, { ...DEFAULTS, apiUrl: 'https://second/' })
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    expect(raw.apiUrl).toBe('https://second/')
    // Only the renamed target file should exist — no .tmp residue, no
    // backup file, no concatenation of previous + new content.
    expect(readdirSync(dir)).toEqual(['thunder-desktop-settings.json'])
  })

  // ─── migrateApiUrl (TD-029 prod cutover) ──────────────────────────

  describe('migrateApiUrl (TD-029)', () => {
    const LEGACY = 'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'
    const PROD: ThunderSettings = {
      apiUrl: 'https://iunjwmwjv0.execute-api.ap-south-1.amazonaws.com/prod/',
      downloadFolder: '/tmp/Thunder'
    }

    it('rewrites apiUrl to defaults.apiUrl when the stored value is the legacy dev URL', () => {
      writeSettingsFile(path, { ...PROD, apiUrl: LEGACY })
      migrateApiUrl(path, PROD, [LEGACY])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(PROD.apiUrl)
    })

    it('preserves a custom apiUrl that is not in the legacy list', () => {
      const custom = 'https://staging.halo.example/'
      writeSettingsFile(path, { ...PROD, apiUrl: custom })
      migrateApiUrl(path, PROD, [LEGACY])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(custom)
    })

    it('is idempotent — a second run after migration does not re-touch the file', () => {
      writeSettingsFile(path, { ...PROD, apiUrl: LEGACY })
      migrateApiUrl(path, PROD, [LEGACY])
      const firstMtime = readFileSync(path, 'utf-8')
      migrateApiUrl(path, PROD, [LEGACY])
      // After the first run the value is no longer in the legacy list,
      // so the second run is a no-op and the on-disk content is
      // byte-identical (no rewrite, no temp-file dance).
      expect(readFileSync(path, 'utf-8')).toBe(firstMtime)
    })

    it('preserves other fields (downloadFolder, userAgent) while rewriting apiUrl', () => {
      writeSettingsFile(path, {
        apiUrl: LEGACY,
        downloadFolder: '/Users/test/Downloads/Thunder',
        userAgent: 'CustomUA/1.0'
      })
      migrateApiUrl(path, PROD, [LEGACY])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw).toEqual({
        apiUrl: PROD.apiUrl,
        downloadFolder: '/Users/test/Downloads/Thunder',
        userAgent: 'CustomUA/1.0'
      })
    })

    it('no-ops when the settings file is missing', () => {
      // Migration runs after `ensureSettingsFile` in production, so a
      // missing file at this point would mean the seed write itself
      // failed — surface nothing here, just don't throw.
      expect(() => migrateApiUrl(path, PROD, [LEGACY])).not.toThrow()
      expect(readdirSync(dir)).toEqual([])
    })

    it('no-ops when the file is unparseable rather than rewriting it', () => {
      // `ensureSettingsFile` is responsible for repairing a corrupt
      // file; the migration shouldn't second-guess that policy.
      writeFileSync(path, '{ not json')
      migrateApiUrl(path, PROD, [LEGACY])
      expect(readFileSync(path, 'utf-8')).toBe('{ not json')
    })

    it('no-ops when the stored apiUrl is not a string (defensive)', () => {
      writeFileSync(path, JSON.stringify({ apiUrl: 42, downloadFolder: '/tmp' }))
      migrateApiUrl(path, PROD, [LEGACY])
      // File untouched — readSettings will fall back to defaults at
      // the next read regardless.
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as { apiUrl: unknown }
      expect(raw.apiUrl).toBe(42)
    })

    it('matches against multiple legacy URLs (forward-compat for future cutovers)', () => {
      const legacyA = 'https://old-a.example/'
      const legacyB = 'https://old-b.example/'
      writeSettingsFile(path, { ...PROD, apiUrl: legacyB })
      migrateApiUrl(path, PROD, [legacyA, legacyB])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(PROD.apiUrl)
    })
  })
})
