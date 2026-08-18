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
  DEFAULT_BEDROCK_MODEL_ID,
  DEFAULT_BEDROCK_REGION,
  DEFAULT_DEV_API_URL,
  DEFAULT_DEV_MCP_URL,
  DEFAULT_MCP_URL,
  LEGACY_BEDROCK_MODEL_ID,
  LEGACY_BEDROCK_REGION,
  LEGACY_DEV_API_URL,
  LEGACY_PROD_API_URL,
  resolveDefaultApiUrl,
  resolveDefaultMcpUrl,
  type ThunderSettings
} from '../../shared/settings'
import {
  ensureSettingsFile,
  getSetting,
  migrateSetting,
  readSettings,
  setSetting
} from './settings-io'
// TD-063: filename lives in `userdata-seed` so the dev-profile seed
// list can't drift from the real path.
import { SETTINGS_FILENAME } from '../userdata-seed'

// Memoised after first access. `app.getPath()` is cheap, but we hit
// these on every IPC invocation and the values can't change after
// `app.whenReady()` — so cache them at first read. The lazy form
// (rather than top-level constants) is required because `app.getPath`
// throws if called before `app.whenReady()`.
let cachedPath: string | null = null
let cachedDefaults: ThunderSettings | null = null

function settingsPath(): string {
  if (cachedPath === null) {
    cachedPath = join(app.getPath('userData'), SETTINGS_FILENAME)
  }
  return cachedPath
}

/**
 * Single source of truth for the shipped defaults. Exported because
 * `browser-download.ts` reads settings through the same file and would
 * otherwise keep its own copy — a drift trap now that TD-052 has taken
 * the record past two fields.
 */
export function defaults(): ThunderSettings {
  if (cachedDefaults === null) {
    cachedDefaults = {
      // TD-060: dev backend for unpackaged runs unless `-prod` was
      // passed; packaged builds are always prod.
      apiUrl: resolveDefaultApiUrl({ isPackaged: app.isPackaged, argv: process.argv }),
      downloadFolder: join(app.getPath('downloads'), 'Thunder'),
      // TD-066: paired with `apiUrl` — halo-mcp forwards the caller's
      // Halo token, so a dev API URL with a prod MCP URL is a 401 on
      // every question.
      mcpUrl: resolveDefaultMcpUrl({ isPackaged: app.isPackaged, argv: process.argv }),
      bedrockRegion: DEFAULT_BEDROCK_REGION,
      bedrockModelId: DEFAULT_BEDROCK_MODEL_ID,
      chatEnabled: false
    }
  }
  return cachedDefaults
}

/**
 * TD-053: main-process only. Read per connection rather than cached so
 * a Settings change takes effect on the next MCP session instead of the
 * next app launch.
 */
export function resolveMcpUrl(): string {
  return getSetting(settingsPath(), defaults(), 'mcpUrl')
}

/**
 * TD-054: main-process only. Read per turn for the same reason as
 * {@link resolveMcpUrl} — flipping the chat off, or repointing it at a
 * region the account actually has model access in, should take effect
 * on the next question rather than the next launch.
 */
export function resolveChatSettings(): Pick<
  ThunderSettings,
  'chatEnabled' | 'bedrockRegion' | 'bedrockModelId'
> {
  const settings = readSettings(settingsPath(), defaults())
  return {
    chatEnabled: settings.chatEnabled,
    bedrockRegion: settings.bedrockRegion,
    bedrockModelId: settings.bedrockModelId
  }
}

// The persistable keys and the type each one accepts. A table rather
// than a list plus a special case, so adding a non-string field is a
// one-line entry here instead of another branch in `isValidValue` —
// and so a field added to `ThunderSettings` without a matching entry
// fails to compile rather than silently becoming unsettable.
const FIELD_TYPES: Record<keyof ThunderSettings, 'string' | 'boolean'> = {
  apiUrl: 'string',
  downloadFolder: 'string',
  userAgent: 'string',
  mcpUrl: 'string',
  bedrockRegion: 'string',
  bedrockModelId: 'string',
  chatEnabled: 'boolean'
}

function isValidKey(key: unknown): key is keyof ThunderSettings {
  return typeof key === 'string' && Object.hasOwn(FIELD_TYPES, key)
}

/**
 * TD-052: `mcpUrl` becomes an outbound request target in TD-053, so it
 * is validated here and not only in the Settings modal — the renderer's
 * check is a UX affordance, and main must not trust it. Restricting the
 * scheme keeps `file:`/`data:` and similar out of the field before
 * anything is built on top of it.
 */
function isValidHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

// Booleans must accept `false` — a truthiness or length check would
// reject the chat toggle's off state outright. Strings must be
// non-empty.
//
// `userAgent` is optional in the schema, but "absent" means the key
// isn't present at all — IPC drops `undefined` arguments anyway, so we
// don't try to support `set('userAgent', undefined)` as a clear path. A
// dedicated `settings:clear` channel would be the right shape if that's
// ever needed.
function isValidValue(key: keyof ThunderSettings, value: unknown): boolean {
  if (FIELD_TYPES[key] === 'boolean') return typeof value === 'boolean'
  if (typeof value !== 'string' || value.length === 0) return false
  if (key === 'mcpUrl') return isValidHttpUrl(value)
  return true
}

export function registerSettingsHandlers(): void {
  // Seeds the file with defaults on first launch (and rewrites it if
  // the existing file is unparseable) so the renderer's first read
  // always returns a coherent record.
  ensureSettingsFile(settingsPath(), defaults())
  // TD-029/TD-051: rewrite either previously shipped `execute-api`
  // default to the current managed-domain default for users upgrading
  // from an older build. Idempotent — a no-op once the value has been
  // rewritten or if the user set a custom override.
  //
  // TD-060: unpackaged runs additionally flip an untouched *current*
  // default to the other one, so toggling `-prod` retargets a settings
  // file that already exists — without it, the new dev default would
  // only ever apply on a machine that has never launched the app. A
  // URL the developer typed into Settings is still left alone, and
  // packaged builds keep the legacy-only list so a deliberate
  // halo-dev override there survives a restart.
  const shippedDefaults = app.isPackaged
    ? []
    : [DEFAULT_API_URL, DEFAULT_DEV_API_URL].filter((url) => url !== defaults().apiUrl)
  migrateSetting(settingsPath(), defaults(), 'apiUrl', [
    LEGACY_DEV_API_URL,
    LEGACY_PROD_API_URL,
    ...shippedDefaults
  ])

  // TD-066: the same retarget for `mcpUrl`. No legacy list of its own —
  // `mcpUrl` has only ever shipped the one default, so the untouched
  // values to flip are exactly the two current ones. Packaged builds
  // migrate nothing, so a deliberate override there survives a restart.
  const shippedMcpDefaults = app.isPackaged
    ? []
    : [DEFAULT_MCP_URL, DEFAULT_DEV_MCP_URL].filter((url) => url !== defaults().mcpUrl)
  migrateSetting(settingsPath(), defaults(), 'mcpUrl', shippedMcpDefaults)

  // TD-064: unlike the URL migrations above, this one runs in packaged
  // builds too. The pair it replaces 404s on every question against the
  // app's own client, so there is no deployment where leaving it in
  // place is the user's intent — and no "deliberate override" to
  // protect, because nobody chose a combination that never worked. A
  // region or model the user actually typed does not match these
  // literals and is left alone.
  migrateSetting(settingsPath(), defaults(), 'bedrockRegion', [LEGACY_BEDROCK_REGION])
  migrateSetting(settingsPath(), defaults(), 'bedrockModelId', [LEGACY_BEDROCK_MODEL_ID])

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
