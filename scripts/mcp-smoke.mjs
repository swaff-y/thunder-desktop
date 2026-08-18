/**
 * TD-053 smoke test: proves the stored Halo access token actually gets
 * a session out of halo-mcp and a real record back. Run it with
 * `npm run smoke:mcp`.
 *
 * Runs under the `electron` binary rather than bare `node` — and has
 * to. The token is sealed with `safeStorage`, which is backed by the OS
 * keychain and only exists inside an Electron process after
 * `app.whenReady()`. A plain Node script cannot read it back.
 *
 * Launched as a loose script, Electron names itself "Electron" and
 * would read `<appData>/Electron` — never the directory the app writes
 * to. {@link APP_DIRS} pins the real ones instead: TD-063 gives an
 * unpackaged run `<name>-dev`, `npm run dev` before that used the bare
 * package `name`, and a packaged build uses the `productName` from
 * `electron-builder.yml`.
 *
 * The settings/credential reads and the failure classification below
 * are duplicated from `src/shared/settings.ts`, `src/main/ipc/auth-io.ts`
 * and `src/main/mcp/errors.ts` rather than imported: this file runs
 * through the bare `electron` binary with no TS loader, so it cannot
 * import the app's TypeScript modules. Same constraint as
 * `bedrock-smoke.mjs`. Keep them in sync by hand.
 */

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'

/** Dev first — that's the profile a developer running this is testing. */
const APP_DIRS = ['thunder-desktop-dev', 'thunder-desktop', 'Thunder Desktop']
const SETTINGS_FILENAME = 'thunder-desktop-settings.json'
const CREDENTIALS_FILENAME = 'thunder-desktop-credentials.enc'

const DEFAULT_MCP_URL = 'https://halo-mcp.swaff.name/mcp'
const CALL_TIMEOUT_MS = 30_000

function readJson(path) {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Picks the profile directory the app actually wrote to — the first
 * candidate holding a settings file, else the dev one so the failure
 * message names a real path.
 */
function resolveUserData() {
  const appData = app.getPath('appData')
  const candidates = APP_DIRS.map((name) => join(appData, name))
  return candidates.find((dir) => existsSync(join(dir, SETTINGS_FILENAME))) ?? candidates[0]
}

function readMcpUrl(userData) {
  const settings = readJson(join(userData, SETTINGS_FILENAME)) ?? {}
  const value = settings.mcpUrl
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : DEFAULT_MCP_URL
}

function readToken(userData) {
  const entry = readJson(join(userData, CREDENTIALS_FILENAME))
  if (!entry?.token) return null
  if (!entry.encrypted) return entry.token
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('safeStorage is unavailable — cannot decrypt the stored Halo token.')
    return null
  }
  try {
    return safeStorage.decryptString(Buffer.from(entry.token, 'base64'))
  } catch (error) {
    console.error('Failed to decrypt the stored Halo token:', error.message)
    return null
  }
}

// Copied verbatim from `src/main/mcp/errors.ts` — see the header note on
// why this file cannot import it. Copied rather than approximated: a
// looser rule here would report a different kind than the app does for
// the same failure, which is the one thing this script exists to check.
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
])
const NETWORK_MESSAGE = /fetch failed|network|socket hang up|timed? ?out|aborted/i
const SESSION_EXPIRED =
  /(session|token|credential)s?\b[^.]{0,40}\b(expired|invalid)|expired\b[^.]{0,20}\b(session|token)|unauthori[sz]ed|not authenticated/i

/**
 * Mirrors `toMcpFailure` so the kinds the renderer branches on are the
 * kinds this script prints — steps 2 to 4 of the ticket's test plan
 * check exactly these.
 */
function classify(error) {
  if (error instanceof StreamableHTTPError) {
    return error.code === 401 || error.code === 403 ? 'unauthorized' : 'protocol'
  }
  if (error instanceof McpError) {
    const stalled =
      error.code === ErrorCode.RequestTimeout || error.code === ErrorCode.ConnectionClosed
    return stalled ? 'unreachable' : 'protocol'
  }
  if (NETWORK_CODES.has(error?.code) || NETWORK_MESSAGE.test(error?.message ?? '')) {
    return 'unreachable'
  }
  return 'protocol'
}

const REMEDY = {
  unauthorized: 'The stored Halo token was rejected. Sign in again in the app and rerun.',
  unreachable: 'Could not reach halo-mcp — check the network and that mcpUrl is right.',
  tool_error: 'halo-mcp ran the tool and it failed — the message above is the tool talking.',
  protocol: 'halo-mcp answered, but not with valid MCP — check mcpUrl points at the /mcp path.'
}

/** halo-mcp returns `{ items, next_cursor }` as JSON in a text block. */
function firstRecordId(result) {
  const text = result.content.find((block) => block.type === 'text')?.text
  if (text === undefined) return null
  try {
    const { items } = JSON.parse(text)
    return Array.isArray(items) ? (items[0]?.id ?? null) : null
  } catch {
    return null
  }
}

// Must happen before `whenReady()`. On macOS `safeStorage` derives its
// keychain entry from the app name, so a loose script left as "Electron"
// holds a different key and cannot decrypt anything the app wrote — the
// failure looks like a corrupt token rather than a misnamed process.
const userData = resolveUserData()
app.setName(basename(userData))
app.setPath('userData', userData)

app.whenReady().then(async () => {
  const mcpUrl = readMcpUrl(userData)
  const token = readToken(userData)

  console.log(`userData:  ${userData}`)
  console.log(`mcpUrl:    ${mcpUrl}`)
  console.log(`token:     ${token ? 'stored (encrypted)' : 'MISSING'}`)
  console.log('')

  if (!token) {
    console.error('❌ No Halo token is stored. Sign in through the app, then rerun.')
    app.exit(1)
    return
  }

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    fetch: (url, init) => {
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${token}`)
      return fetch(url, { ...init, headers })
    }
  })
  const client = new Client(
    { name: 'thunder-desktop-smoke', version: '1.0.0' },
    { capabilities: {} }
  )

  try {
    await client.connect(transport, { timeout: CALL_TIMEOUT_MS })

    const { tools } = await client.listTools(undefined, { timeout: CALL_TIMEOUT_MS })
    console.log(`✅ ${tools.length} tools`)
    console.log(`   ${tools.map((tool) => tool.name).join(', ')}`)
    console.log('')

    const result = await client.callTool(
      { name: 'search_records', arguments: { limit: 2 } },
      undefined,
      { timeout: CALL_TIMEOUT_MS }
    )

    if (result.isError) {
      // An HTTP 200 can still carry a dead session: Halo rejects the
      // forwarded token downstream of halo-mcp and the refusal comes
      // back as tool output. `toolResultFailure` splits the two the
      // same way.
      const text = result.content.map((block) => block.text ?? '').join('\n')
      const kind = SESSION_EXPIRED.test(text) ? 'unauthorized' : 'tool_error'
      console.error(`❌ search_records returned an error result (${kind}).\n`)
      console.error(REMEDY[kind])
      console.error(`\n${text}`)
      await client.close()
      app.exit(1)
      return
    }

    const id = firstRecordId(result)
    if (id === null) {
      console.error('❌ search_records succeeded but no record id could be read from the result:')
      console.error(`   ${JSON.stringify(result.content).slice(0, 400)}`)
      await client.close()
      app.exit(1)
      return
    }

    console.log(`✅ search_records → first record id: ${id}`)
    await client.close()
    app.exit(0)
  } catch (error) {
    const kind = classify(error)
    console.error(`❌ halo-mcp call failed (${kind}).\n`)
    console.error(REMEDY[kind])
    console.error(`\n${error?.message ?? String(error)}`)
    app.exit(1)
  }
})
