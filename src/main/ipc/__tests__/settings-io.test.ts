import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  dropRetiredSettings,
  ensureSettingsFile,
  getSetting,
  migrateSetting,
  readSettings,
  setSetting,
  writeSettings,
  writeSettingsFile,
  type ThunderSettings
} from '../settings-io'
import {
  DEFAULT_API_URL,
  DEFAULT_CONTEXT_URL,
  DEFAULT_DEV_API_URL,
  DEFAULT_DEV_CONTEXT_URL,
  LEGACY_DEV_API_URL,
  LEGACY_PROD_API_URL,
  resolveDefaultApiUrl,
  resolveDefaultContextUrl
} from '../../../shared/settings'

const DEFAULTS: ThunderSettings = {
  apiUrl: 'https://halo.example/dev/',
  downloadFolder: '/tmp/Thunder',
  contextUrl: 'https://thunder-context.example/v1',
  chatEnabled: false
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
      ...DEFAULTS,
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
      ...DEFAULTS,
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
      ...DEFAULTS,
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

  // ─── AI chat fields (TD-052) ──────────────────────────────────────

  describe('AI chat fields (TD-052, TD-065)', () => {
    it('exposes the shipped context-server defaults', () => {
      expect(DEFAULT_CONTEXT_URL).toBe('https://thunder-context.swaff.name/v1')
      expect(DEFAULT_DEV_CONTEXT_URL).toBe('https://thunder-context-dev.swaff.name/v1')
    })

    // Request paths are appended with a leading slash, so a trailing one
    // here would produce `.../v1//conversations`.
    it('ships a context URL with no trailing slash', () => {
      expect(DEFAULT_CONTEXT_URL).not.toMatch(/\/$/)
      expect(DEFAULT_DEV_CONTEXT_URL).not.toMatch(/\/$/)
    })

    it('falls back to defaults when the chat fields are absent from the file', () => {
      writeFileSync(path, JSON.stringify({ apiUrl: 'https://a/' }))
      const settings = readSettings(path, DEFAULTS)
      expect(settings.contextUrl).toBe(DEFAULTS.contextUrl)
      expect(settings.chatEnabled).toBe(false)
    })

    it('round-trips explicit values for the chat fields', () => {
      const settings: ThunderSettings = {
        ...DEFAULTS,
        contextUrl: 'https://thunder-context.staging.example/v1',
        chatEnabled: true
      }
      writeSettingsFile(path, settings)
      expect(readSettings(path, DEFAULTS)).toEqual(settings)
    })

    it('trims surrounding whitespace off contextUrl', () => {
      writeFileSync(path, JSON.stringify({ contextUrl: '  https://ctx.example/v1\n' }))
      expect(readSettings(path, DEFAULTS).contextUrl).toBe('https://ctx.example/v1')
    })

    it('falls back rather than persisting a whitespace-only contextUrl', () => {
      writeFileSync(path, JSON.stringify({ contextUrl: '   ' }))
      expect(readSettings(path, DEFAULTS).contextUrl).toBe(DEFAULTS.contextUrl)
    })

    it('falls back when contextUrl is not a string', () => {
      writeFileSync(path, JSON.stringify({ contextUrl: 42 }))
      expect(readSettings(path, DEFAULTS).contextUrl).toBe(DEFAULTS.contextUrl)
    })

    it('preserves chatEnabled: false rather than treating it as absent', () => {
      // A truthiness check here would silently re-enable chat on every
      // read for anyone who turned it off.
      writeSettingsFile(path, { ...DEFAULTS, chatEnabled: true })
      setSetting(path, DEFAULTS, 'chatEnabled', false)
      expect(readSettings(path, DEFAULTS).chatEnabled).toBe(false)
    })

    it('falls back to the default when chatEnabled is not a boolean', () => {
      writeFileSync(path, JSON.stringify({ chatEnabled: 'yes' }))
      expect(readSettings(path, DEFAULTS).chatEnabled).toBe(false)
    })

    it('persists a trimmed value written through setSetting', () => {
      writeSettingsFile(path, DEFAULTS)
      setSetting(path, DEFAULTS, 'contextUrl', '  https://ctx.example/v1  ')
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.contextUrl).toBe('https://ctx.example/v1')
    })

    it('never carries AWS key material — those live in the encrypted store', () => {
      writeSettingsFile(path, DEFAULTS)
      const raw = readFileSync(path, 'utf-8')
      expect(raw).not.toMatch(/accessKeyId|secretAccessKey|sessionToken/)
    })
  })

  // ─── API URL constants (TD-051 managed-domain cutover) ────────────

  describe('API URL constants (TD-051)', () => {
    // Callers concatenate (`${API_URL}v1/login`) and axios joins
    // relative paths against this as a `baseURL` — a missing or doubled
    // trailing slash breaks every request path.
    it('defaults to the managed prod domain with a single trailing slash', () => {
      expect(DEFAULT_API_URL).toBe('https://halo.swaff.name/')
      expect(new URL('v1/login', DEFAULT_API_URL).href).toBe('https://halo.swaff.name/v1/login')
    })

    // The legacy literals are matched by exact string equality against
    // values written by shipped builds, so they can never be edited to
    // follow a future default change.
    it('pins the legacy URLs to the literals older builds shipped', () => {
      expect(LEGACY_DEV_API_URL).toBe(
        'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'
      )
      expect(LEGACY_PROD_API_URL).toBe(
        'https://iunjwmwjv0.execute-api.ap-south-1.amazonaws.com/prod/'
      )
    })
  })

  // ─── resolveDefaultApiUrl (TD-060 dev-by-default) ─────────────────

  describe('resolveDefaultApiUrl (TD-060)', () => {
    it('defaults an unpackaged run to the dev backend', () => {
      expect(resolveDefaultApiUrl({ isPackaged: false, argv: ['electron', '.'] })).toBe(
        DEFAULT_DEV_API_URL
      )
    })

    it('opts an unpackaged run back into prod with -prod or --prod', () => {
      expect(resolveDefaultApiUrl({ isPackaged: false, argv: ['electron', '.', '-prod'] })).toBe(
        DEFAULT_API_URL
      )
      expect(resolveDefaultApiUrl({ isPackaged: false, argv: ['electron', '.', '--prod'] })).toBe(
        DEFAULT_API_URL
      )
    })

    // A shipped build must not be talkable onto the dev backend by
    // whatever argv the launcher happens to pass.
    it('ignores argv entirely when packaged', () => {
      expect(resolveDefaultApiUrl({ isPackaged: true, argv: ['Thunder Desktop'] })).toBe(
        DEFAULT_API_URL
      )
      expect(resolveDefaultApiUrl({ isPackaged: true, argv: ['Thunder Desktop', '-prod'] })).toBe(
        DEFAULT_API_URL
      )
    })

    // Substring matches would make `--production` or a path containing
    // "-prod" silently repoint the app at prod.
    it('matches the flag exactly, not as a substring', () => {
      expect(
        resolveDefaultApiUrl({ isPackaged: false, argv: ['electron', '.', '--production'] })
      ).toBe(DEFAULT_DEV_API_URL)
    })

    it('keeps the dev URL on a single trailing slash', () => {
      expect(DEFAULT_DEV_API_URL).toBe('https://halo-dev.swaff.name/')
      expect(new URL('v1/login', DEFAULT_DEV_API_URL).href).toBe(
        'https://halo-dev.swaff.name/v1/login'
      )
    })
  })

  // ─── resolveDefaultContextUrl (TD-065, paired with the API URL) ────────

  describe('resolveDefaultContextUrl (TD-065)', () => {
    it('defaults an unpackaged run to the dev thunder-context', () => {
      expect(resolveDefaultContextUrl({ isPackaged: false, argv: ['electron', '.'] })).toBe(
        DEFAULT_DEV_CONTEXT_URL
      )
    })

    it('opts an unpackaged run back into prod with -prod or --prod', () => {
      expect(resolveDefaultContextUrl({ isPackaged: false, argv: ['electron', '.', '-prod'] })).toBe(
        DEFAULT_CONTEXT_URL
      )
      expect(resolveDefaultContextUrl({ isPackaged: false, argv: ['electron', '.', '--prod'] })).toBe(
        DEFAULT_CONTEXT_URL
      )
    })

    it('ignores argv entirely when packaged', () => {
      expect(resolveDefaultContextUrl({ isPackaged: true, argv: ['Thunder Desktop', '-prod'] })).toBe(
        DEFAULT_CONTEXT_URL
      )
      expect(resolveDefaultContextUrl({ isPackaged: true, argv: ['Thunder Desktop'] })).toBe(
        DEFAULT_CONTEXT_URL
      )
    })

    // thunder-context forwards the caller's Halo token, so a launch that
    // resolves one field to dev and the other to prod 401s on the first
    // question.
    it('names the same environment as resolveDefaultApiUrl for any launch', () => {
      const launches = [
        { isPackaged: false, argv: ['electron', '.'] },
        { isPackaged: false, argv: ['electron', '.', '-prod'] },
        { isPackaged: false, argv: ['electron', '.', '--prod'] },
        { isPackaged: false, argv: ['electron', '.', '--production'] },
        { isPackaged: true, argv: ['Thunder Desktop'] },
        { isPackaged: true, argv: ['Thunder Desktop', '-prod'] }
      ]
      for (const launch of launches) {
        const apiIsDev = resolveDefaultApiUrl(launch) === DEFAULT_DEV_API_URL
        const contextIsDev = resolveDefaultContextUrl(launch) === DEFAULT_DEV_CONTEXT_URL
        expect(contextIsDev).toBe(apiIsDev)
      }
    })
  })

  // ─── migrateSetting: apiUrl (TD-029 cutover, TD-051 managed domain) ───

  describe('migrateSetting — apiUrl (TD-029, TD-051)', () => {
    const LEGACY = LEGACY_DEV_API_URL
    const LEGACY_PROD = LEGACY_PROD_API_URL
    const PROD: ThunderSettings = {
      ...DEFAULTS,
      apiUrl: DEFAULT_API_URL,
      downloadFolder: '/tmp/Thunder'
    }

    it('rewrites apiUrl to defaults.apiUrl when the stored value is the legacy prod URL', () => {
      writeSettingsFile(path, { ...PROD, apiUrl: LEGACY_PROD })
      migrateSetting(path, PROD, 'apiUrl', [LEGACY, LEGACY_PROD])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(PROD.apiUrl)
    })

    it('rewrites apiUrl to defaults.apiUrl when the stored value is the legacy dev URL', () => {
      writeSettingsFile(path, { ...PROD, apiUrl: LEGACY })
      migrateSetting(path, PROD, 'apiUrl', [LEGACY, LEGACY_PROD])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(PROD.apiUrl)
    })

    it('preserves a custom apiUrl that is not in the legacy list', () => {
      const custom = 'https://staging.halo.example/'
      writeSettingsFile(path, { ...PROD, apiUrl: custom })
      migrateSetting(path, PROD, 'apiUrl', [LEGACY])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(custom)
    })

    it('is idempotent — a second run after migration does not re-touch the file', () => {
      writeSettingsFile(path, { ...PROD, apiUrl: LEGACY })
      migrateSetting(path, PROD, 'apiUrl', [LEGACY])
      const firstMtime = readFileSync(path, 'utf-8')
      migrateSetting(path, PROD, 'apiUrl', [LEGACY])
      // After the first run the value is no longer in the legacy list,
      // so the second run is a no-op and the on-disk content is
      // byte-identical (no rewrite, no temp-file dance).
      expect(readFileSync(path, 'utf-8')).toBe(firstMtime)
    })

    it('preserves other fields (downloadFolder, userAgent) while rewriting apiUrl', () => {
      writeSettingsFile(path, {
        ...DEFAULTS,
        apiUrl: LEGACY,
        downloadFolder: '/Users/test/Downloads/Thunder',
        userAgent: 'CustomUA/1.0'
      })
      migrateSetting(path, PROD, 'apiUrl', [LEGACY])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw).toEqual({
        ...DEFAULTS,
        apiUrl: PROD.apiUrl,
        downloadFolder: '/Users/test/Downloads/Thunder',
        userAgent: 'CustomUA/1.0'
      })
    })

    it('no-ops when the settings file is missing', () => {
      // Migration runs after `ensureSettingsFile` in production, so a
      // missing file at this point would mean the seed write itself
      // failed — surface nothing here, just don't throw.
      expect(() => migrateSetting(path, PROD, 'apiUrl', [LEGACY])).not.toThrow()
      expect(readdirSync(dir)).toEqual([])
    })

    it('no-ops when the file is unparseable rather than rewriting it', () => {
      // `ensureSettingsFile` is responsible for repairing a corrupt
      // file; the migration shouldn't second-guess that policy.
      writeFileSync(path, '{ not json')
      migrateSetting(path, PROD, 'apiUrl', [LEGACY])
      expect(readFileSync(path, 'utf-8')).toBe('{ not json')
    })

    it('no-ops when the stored apiUrl is not a string (defensive)', () => {
      writeFileSync(path, JSON.stringify({ apiUrl: 42, downloadFolder: '/tmp' }))
      migrateSetting(path, PROD, 'apiUrl', [LEGACY])
      // File untouched — readSettings will fall back to defaults at
      // the next read regardless.
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as { apiUrl: unknown }
      expect(raw.apiUrl).toBe(42)
    })

    it('matches against multiple legacy URLs (forward-compat for future cutovers)', () => {
      const legacyA = 'https://old-a.example/'
      const legacyB = 'https://old-b.example/'
      writeSettingsFile(path, { ...PROD, apiUrl: legacyB })
      migrateSetting(path, PROD, 'apiUrl', [legacyA, legacyB])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(PROD.apiUrl)
    })
  })

  // ─── migrateSetting: contextUrl (TD-065) ──────────────────────────

  describe('migrateSetting — contextUrl (TD-065)', () => {
    // What an unpackaged run passes: the shipped default it did *not*
    // resolve to. Mirrors `shippedContextDefaults` in `ipc/settings.ts`.
    const DEV: ThunderSettings = { ...DEFAULTS, contextUrl: DEFAULT_DEV_CONTEXT_URL }

    it('retargets a settings file pinned to the prod context default', () => {
      writeSettingsFile(path, { ...DEV, contextUrl: DEFAULT_CONTEXT_URL })
      migrateSetting(path, DEV, 'contextUrl', [DEFAULT_CONTEXT_URL])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.contextUrl).toBe(DEFAULT_DEV_CONTEXT_URL)
    })

    it('flips back to prod on a -prod launch', () => {
      const prod: ThunderSettings = { ...DEFAULTS, contextUrl: DEFAULT_CONTEXT_URL }
      writeSettingsFile(path, { ...prod, contextUrl: DEFAULT_DEV_CONTEXT_URL })
      migrateSetting(path, prod, 'contextUrl', [DEFAULT_DEV_CONTEXT_URL])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.contextUrl).toBe(DEFAULT_CONTEXT_URL)
    })

    it('preserves a custom contextUrl typed into Settings', () => {
      const custom = 'https://localhost:8787/v1'
      writeSettingsFile(path, { ...DEV, contextUrl: custom })
      migrateSetting(path, DEV, 'contextUrl', [DEFAULT_CONTEXT_URL, DEFAULT_DEV_CONTEXT_URL])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.contextUrl).toBe(custom)
    })

    it('is idempotent', () => {
      writeSettingsFile(path, { ...DEV, contextUrl: DEFAULT_CONTEXT_URL })
      migrateSetting(path, DEV, 'contextUrl', [DEFAULT_CONTEXT_URL])
      const first = readFileSync(path, 'utf-8')
      migrateSetting(path, DEV, 'contextUrl', [DEFAULT_CONTEXT_URL])
      expect(readFileSync(path, 'utf-8')).toBe(first)
    })

    it('leaves apiUrl alone while rewriting contextUrl', () => {
      const custom = 'https://staging.halo.example/'
      writeSettingsFile(path, { ...DEV, apiUrl: custom, contextUrl: DEFAULT_CONTEXT_URL })
      migrateSetting(path, DEV, 'contextUrl', [DEFAULT_CONTEXT_URL])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(custom)
      expect(raw.contextUrl).toBe(DEFAULT_DEV_CONTEXT_URL)
    })

    it('no-ops on an empty legacy list (the packaged-build case)', () => {
      writeSettingsFile(path, { ...DEV, contextUrl: DEFAULT_CONTEXT_URL })
      migrateSetting(path, DEV, 'contextUrl', [])
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.contextUrl).toBe(DEFAULT_CONTEXT_URL)
    })
  })

  // ─── dropRetiredSettings (TD-065 cutover) ─────────────────────────

  describe('dropRetiredSettings (TD-065)', () => {
    // The shape every pre-cutover machine has on disk.
    const legacyFile = {
      apiUrl: 'https://halo.example/dev/',
      downloadFolder: '/tmp/Thunder',
      mcpUrl: 'https://halo-mcp.swaff.name/mcp',
      bedrockRegion: 'us-east-1',
      bedrockModelId: 'anthropic.claude-sonnet-5',
      chatEnabled: true
    }

    it('removes the three retired keys and adds contextUrl', () => {
      writeFileSync(path, JSON.stringify(legacyFile))
      dropRetiredSettings(path, DEFAULTS)
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
      expect(raw).not.toHaveProperty('mcpUrl')
      expect(raw).not.toHaveProperty('bedrockRegion')
      expect(raw).not.toHaveProperty('bedrockModelId')
      expect(raw.contextUrl).toBe(DEFAULTS.contextUrl)
    })

    it('keeps the settings the user actually chose', () => {
      writeFileSync(path, JSON.stringify(legacyFile))
      dropRetiredSettings(path, DEFAULTS)
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.apiUrl).toBe(legacyFile.apiUrl)
      expect(raw.downloadFolder).toBe(legacyFile.downloadFolder)
      expect(raw.chatEnabled).toBe(true)
    })

    // A halo-mcp endpoint is not a thunder-context one; carrying it
    // across would point the chat at a URL that answers nothing.
    it('does not resurrect a hand-typed mcpUrl as the contextUrl', () => {
      writeFileSync(path, JSON.stringify({ ...legacyFile, mcpUrl: 'https://localhost:8787/mcp' }))
      dropRetiredSettings(path, DEFAULTS)
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as ThunderSettings
      expect(raw.contextUrl).toBe(DEFAULTS.contextUrl)
    })

    it('leaves a file that has already been migrated byte for byte', () => {
      writeSettingsFile(path, { ...DEFAULTS, contextUrl: 'https://ctx.example/v1' })
      const before = readFileSync(path, 'utf-8')
      dropRetiredSettings(path, DEFAULTS)
      expect(readFileSync(path, 'utf-8')).toBe(before)
    })

    it('no-ops when the file is missing', () => {
      rmSync(path, { force: true })
      expect(() => dropRetiredSettings(path, DEFAULTS)).not.toThrow()
      expect(readdirSync(dir)).toEqual([])
    })
  })
})
