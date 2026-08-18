/**
 * TD-018: shared settings contract used by all three boundaries
 * (main, preload, renderer). Lives here — and not in `thunder-api.ts`
 * or `settings-io.ts` — so neither side has to reach into the other's
 * tree (and so the renderer doesn't transitively pull in `electron`
 * via `thunder-api.ts`'s `ipcRenderer` import).
 *
 * Anything in this module MUST stay free of `electron` or other
 * runtime imports that aren't safe in a sandboxed renderer.
 */

/**
 * Default Halo prod URL — the managed domain (TD-051 cutover). Single
 * source of truth — main writes it into the settings file on first
 * launch, renderer falls back to it when IPC is unavailable (vitest,
 * dev tools harness, etc.). Keeping this literal in two places used to
 * drift; do not duplicate it.
 *
 * Trailing slash is load-bearing: callers build request URLs by
 * concatenation (`${API_URL}v1/login`) and axios joins relative paths
 * against it as a `baseURL`. Dropping it collapses `v1/...` onto the
 * host root or produces `halo.swaff.namev1/...`.
 */
export const DEFAULT_API_URL = 'https://halo.swaff.name/'

/**
 * TD-060: the dev-account Halo backend. `npm run dev` defaults to this
 * so an unpackaged run never talks to prod by accident; `npm run
 * dev:prod` (or any launch carrying {@link PROD_FLAGS}) opts back into
 * {@link DEFAULT_API_URL}. Packaged builds always ship prod.
 *
 * Trailing slash is load-bearing for the same reason as
 * {@link DEFAULT_API_URL}.
 */
export const DEFAULT_DEV_API_URL = 'https://halo-dev.swaff.name/'

/**
 * TD-060: argv flags that force the prod backend in an unpackaged run.
 * Both spellings are accepted because `-prod` is what reads naturally
 * at the CLI while `--prod` is what habit types.
 */
export const PROD_FLAGS: ReadonlyArray<string> = ['-prod', '--prod']

/**
 * TD-060: how a launch was invoked. Pure (argv and `isPackaged` are
 * passed in) so it can be unit-tested without an Electron `app`.
 *
 * Packaged builds ignore argv entirely — a shipped app must not be
 * talkable onto the dev backend by a command-line flag.
 *
 * TD-066: extracted from `resolveDefaultApiUrl` once `mcpUrl` needed
 * the same rule. Every per-environment default has to answer "dev or
 * prod?" identically, or a single launch ends up straddling both
 * accounts — which is exactly the bug TD-066 fixed.
 */
export function isDevLaunch(options: { isPackaged: boolean; argv: readonly string[] }): boolean {
  if (options.isPackaged) return false
  return !options.argv.some((arg) => PROD_FLAGS.includes(arg))
}

/** TD-060: which Halo backend an unpackaged launch points at. */
export function resolveDefaultApiUrl(options: {
  isPackaged: boolean
  argv: readonly string[]
}): string {
  return isDevLaunch(options) ? DEFAULT_DEV_API_URL : DEFAULT_API_URL
}

/**
 * TD-029: pre-cutover dev URL, retained only so the one-time
 * settings migration can identify untouched defaults from prior
 * versions and rewrite them to the prod URL. Users who explicitly
 * set their `apiUrl` to anything else (including a custom override
 * that happens to equal this string) keep their choice — but
 * matching this exact literal is overwhelmingly likely to be a
 * never-customised default rather than an intentional override.
 *
 * Do not reference this constant from runtime code paths beyond
 * the migration helper. Once a release or two passes (most users
 * upgraded), it can be removed.
 */
export const LEGACY_DEV_API_URL =
  'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'

/**
 * TD-051: the raw `execute-api` prod URL that {@link DEFAULT_API_URL}
 * shipped as before the managed-domain cutover. Retained for the same
 * reason (and under the same rules) as {@link LEGACY_DEV_API_URL}: the
 * migration rewrites it to the managed domain, and nothing else may
 * reference it. Must match the previously shipped literal byte for
 * byte — trailing slash included — or the migration matches nothing.
 *
 * The gateway URL still works if a user pastes it into Settings; this
 * is a migration, not a cut-off.
 */
export const LEGACY_PROD_API_URL =
  'https://iunjwmwjv0.execute-api.ap-south-1.amazonaws.com/prod/'

/**
 * TD-052: halo-mcp endpoint the AI chat reaches for its tool surface.
 * Tunable for the same reason as {@link DEFAULT_API_URL} — staging and
 * local MCP servers exist and shouldn't need a rebuild to point at.
 */
export const DEFAULT_MCP_URL = 'https://halo-mcp.swaff.name/mcp'

/**
 * TD-066: the dev-account halo-mcp deployment, paired with
 * {@link DEFAULT_DEV_API_URL}.
 *
 * The pairing is not cosmetic. halo-mcp holds no credentials of its own
 * — it forwards the caller's Halo bearer token — so an MCP server from
 * one account cannot accept a token minted by the other. A dev run left
 * on the prod MCP URL gets a 401 on the first `listTools()`, which the
 * chat surfaces as "Your session expired." against a token issued
 * seconds earlier.
 */
export const DEFAULT_DEV_MCP_URL = 'https://halo-mcp-dev.swaff.name/mcp'

/**
 * TD-066: which halo-mcp an unpackaged launch points at. Same rule as
 * {@link resolveDefaultApiUrl}, and deliberately sharing
 * {@link isDevLaunch} with it.
 */
export function resolveDefaultMcpUrl(options: {
  isPackaged: boolean
  argv: readonly string[]
}): string {
  return isDevLaunch(options) ? DEFAULT_DEV_MCP_URL : DEFAULT_MCP_URL
}

/**
 * TD-052: AWS region hosting the Bedrock model. Bedrock model access is
 * granted per account *and* per region, so this and
 * {@link DEFAULT_BEDROCK_MODEL_ID} have to agree with what the account
 * has actually been approved for.
 *
 * TD-064: `us-east-1`, because `ap-south-1` serves *nothing* on the
 * Messages-API endpoint the app calls. Probed against the account's own
 * credentials with `AnthropicBedrockMantle`: every candidate — Sonnet 5,
 * Sonnet 4.6, Opus 5, Opus 4.8, Haiku 4.5 — 404s there, while
 * {@link DEFAULT_BEDROCK_MODEL_ID} answers in `us-east-1`.
 *
 * `aws bedrock list-foundation-models --region ap-south-1` disagrees and
 * lists them all. It is describing the legacy `bedrock-runtime`
 * InvokeModel surface, which is a different endpoint with a different
 * catalogue — do not use it to pick this value. Probe the Mantle client
 * instead (`npm run smoke:bedrock`).
 */
export const DEFAULT_BEDROCK_REGION = 'us-east-1'

/**
 * TD-052: Bedrock model id. The `anthropic.` prefix is load-bearing —
 * Bedrock namespaces model ids by provider, so the bare first-party id
 * (`claude-sonnet-5`) 404s.
 *
 * TD-064: exactly one prefix, not two. The `global.` this shipped with
 * is a cross-region *inference profile* id, which belongs to the legacy
 * `bedrock-runtime` InvokeModel path. TD-054 moved the app onto
 * `AnthropicBedrockMantle` — the Messages-API endpoint — which takes the
 * model id verbatim, so the extra prefix made every request a 404:
 * "The model 'global.anthropic.claude-sonnet-5' does not exist".
 *
 * Verified by probing all three spellings against the real account:
 * `global.anthropic.claude-sonnet-5` and bare `claude-sonnet-5` both
 * 404; `anthropic.claude-sonnet-5` answers.
 */
export const DEFAULT_BEDROCK_MODEL_ID = 'anthropic.claude-sonnet-5'

/**
 * TD-064: the region/model pair this app shipped with before the fix.
 * Retained only so the one-time migration can identify a settings file
 * still pinned to the broken defaults and rewrite it — same contract,
 * and the same "do not reference from runtime code" rule, as
 * {@link LEGACY_DEV_API_URL}.
 *
 * The pair never worked against the app's own client, so a stored value
 * matching one of these is an untouched default rather than a
 * deliberate override — nobody chose a combination that 404s on every
 * question.
 */
export const LEGACY_BEDROCK_REGION = 'ap-south-1'
export const LEGACY_BEDROCK_MODEL_ID = 'global.anthropic.claude-sonnet-5'

/**
 * Persisted user-tunable settings.
 *
 * - `apiUrl`        — Halo backend the desktop client talks to. Tunable
 *                     so we can repoint at staging/local without a rebuild.
 * - `downloadFolder`— Destination for any future "save to disk" actions.
 * - `userAgent`     — Optional override for the embedded webview's UA
 *                     (needed for sites that 403 Electron's default).
 * - `mcpUrl`        — TD-052: halo-mcp endpoint backing the AI chat's tools.
 * - `bedrockRegion` — TD-052: AWS region the Bedrock model is invoked in.
 * - `bedrockModelId`— TD-052: Bedrock-namespaced model id (see
 *                     {@link DEFAULT_BEDROCK_MODEL_ID}).
 * - `chatEnabled`   — TD-052: master switch for the AI chat surface.
 *                     Ships `false`; TD-056 is what makes it visible.
 *
 * AWS credentials are deliberately NOT here — they live in an encrypted
 * file written by `main/ipc/aws-creds.ts` and never transit this record.
 */
export interface ThunderSettings {
  apiUrl: string
  downloadFolder: string
  userAgent?: string
  mcpUrl: string
  bedrockRegion: string
  bedrockModelId: string
  chatEnabled: boolean
}
