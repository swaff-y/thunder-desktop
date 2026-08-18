/**
 * TD-052 smoke test: proves the persisted Bedrock settings and the
 * stored AWS credentials actually reach Bedrock. Run it with
 * `npm run smoke:bedrock`.
 *
 * TD-062: builds the same `AnthropicBedrockMantle` client, the same
 * way, as {@link createBedrockModel} in
 * `src/main/chat/bedrock-client.ts`. A smoke test pointed at a
 * different endpoint than the app answers a question nobody asked.
 *
 * Runs under the `electron` binary rather than bare `node` — and has
 * to. The credentials are sealed with `safeStorage`, which is backed by
 * the OS keychain and only exists inside an Electron process after
 * `app.whenReady()`. A plain Node script cannot read them back.
 *
 * Launched as a loose script, Electron names itself "Electron" and
 * would read `<appData>/Electron` — never the directory the app writes
 * to. {@link APP_DIRS} pins the real ones instead: TD-063 gives an
 * unpackaged run `<name>-dev`, `npm run dev` before that used the bare
 * package `name`, and a packaged build uses the `productName` from
 * `electron-builder.yml`.
 *
 * No credentials stored is not a failure: the Bedrock client falls
 * through to the default AWS provider chain (env vars,
 * `~/.aws/credentials`, SSO), which is the supported fallback.
 */

import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'

/** Dev first — that's the profile a developer running this is testing. */
const APP_DIRS = ['thunder-desktop-dev', 'thunder-desktop', 'Thunder Desktop']
const SETTINGS_FILENAME = 'thunder-desktop-settings.json'
const CREDENTIALS_FILENAME = 'thunder-desktop-aws.enc'

// Duplicated from `src/shared/settings.ts` rather than imported: this
// file runs through the bare `electron` binary with no TS loader, so it
// cannot import the app's TypeScript modules. Keep these in sync by
// hand — a stale copy here means the smoke test validates a model id
// the app no longer uses. Same applies to the trim and decrypt logic
// below, which mirror `settings-io.ts` and `aws-creds-io.ts`.
const DEFAULT_BEDROCK_REGION = 'ap-south-1'
const DEFAULT_BEDROCK_MODEL_ID = 'global.anthropic.claude-sonnet-5'

/**
 * Where to point someone whose region does not serve their model on the
 * Messages-API endpoint. `us-east-1` carries the current Anthropic model
 * line, so it is the answer most likely to work first try.
 */
const REFERENCE_REGION = 'us-east-1'

function tryElsewhere(region) {
  if (region === REFERENCE_REGION) {
    return 'Pick a region that carries this model, or a model this region carries.'
  }
  return `Try ${REFERENCE_REGION}, which carries the current Anthropic model line.`
}

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

function readSettings(userData) {
  const settings = readJson(join(userData, SETTINGS_FILENAME)) ?? {}
  const trimmed = (value, fallback) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
  return {
    bedrockRegion: trimmed(settings.bedrockRegion, DEFAULT_BEDROCK_REGION),
    bedrockModelId: trimmed(settings.bedrockModelId, DEFAULT_BEDROCK_MODEL_ID)
  }
}

function readCredentials(userData) {
  const entry = readJson(join(userData, CREDENTIALS_FILENAME))
  if (!entry?.encrypted || !entry.accessKeyId || !entry.secretAccessKey) return null
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('safeStorage is unavailable — cannot decrypt the stored AWS credentials.')
    return null
  }
  const decrypt = (value) => safeStorage.decryptString(Buffer.from(value, 'base64'))
  try {
    return {
      accessKeyId: decrypt(entry.accessKeyId),
      secretAccessKey: decrypt(entry.secretAccessKey),
      sessionToken: entry.sessionToken ? decrypt(entry.sessionToken) : undefined
    }
  } catch (error) {
    console.error('Failed to decrypt the stored AWS credentials:', error.message)
    return null
  }
}

/**
 * Bedrock's failure modes are the whole point of this script, so each
 * one gets a sentence explaining what to do about it rather than a bare
 * stack trace.
 */
function explain(error, region, modelId) {
  const name = error?.type ?? error?.error?.type ?? error?.name ?? ''
  const message = error?.message ?? String(error)

  if (/not_found_error/i.test(name) || error?.status === 404) {
    return [
      `The Bedrock Messages-API endpoint in ${region} does not serve "${modelId}".`,
      'This is the endpoint the app itself calls, so a model id that fails here',
      'will fail in Settings → AI Chat too. Model availability is per region.',
      tryElsewhere(region)
    ].join('\n')
  }
  if (/permission_error|AccessDenied/i.test(name) || /AccessDenied/i.test(message)) {
    return [
      `Bedrock denied access to "${modelId}" in ${region}.`,
      'Model access is granted per account AND per region — request it in the',
      `AWS console (Bedrock → Model access) for ${region}, and check the IAM`,
      'principal is allowed to invoke Bedrock models.'
    ].join('\n')
  }
  if (
    /invalid_request_error|ValidationException/i.test(name) ||
    /ValidationException/i.test(message)
  ) {
    return [
      `Bedrock rejected the request for "${modelId}" in ${region}.`,
      'Check the model id is one the Messages API accepts verbatim — it is sent',
      'through unchanged, not translated.',
      tryElsewhere(region)
    ].join('\n')
  }
  if (
    /authentication_error/i.test(name) ||
    /UnrecognizedClient|InvalidSignature|security token/i.test(message)
  ) {
    return [
      'AWS rejected the credentials.',
      'Re-enter them in Settings → AI Chat, or clear them to fall through to',
      'the default credential chain (~/.aws/credentials, env vars, SSO).'
    ].join('\n')
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return `Could not reach bedrock-mantle.${region}.api.aws — check the region name and your network.`
  }
  return message
}

app.whenReady().then(async () => {
  const userData = resolveUserData()
  const { bedrockRegion, bedrockModelId } = readSettings(userData)
  const creds = readCredentials(userData)

  console.log(`userData:  ${userData}`)
  console.log(`region:    ${bedrockRegion}`)
  console.log(`model:     ${bedrockModelId}`)
  console.log(`creds:     ${creds ? 'stored (encrypted)' : 'default AWS credential chain'}`)
  console.log('')

  const client = new AnthropicBedrockMantle({
    awsRegion: bedrockRegion,
    ...(creds && {
      awsAccessKey: creds.accessKeyId,
      awsSecretAccessKey: creds.secretAccessKey,
      ...(creds.sessionToken && { awsSessionToken: creds.sessionToken })
    })
  })

  try {
    const response = await client.messages.create({
      model: bedrockModelId,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }]
    })
    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
    console.log(`✅ Bedrock responded: ${bedrockModelId} → ${response.model}`)
    console.log(`   ${text.trim()}`)
    app.exit(0)
  } catch (error) {
    console.error('❌ Bedrock call failed.\n')
    console.error(explain(error, bedrockRegion, bedrockModelId))
    app.exit(1)
  }
})
