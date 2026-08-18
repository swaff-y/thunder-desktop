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
export const LEGACY_DEV_API_URL = 'https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/'

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
export const LEGACY_PROD_API_URL = 'https://iunjwmwjv0.execute-api.ap-south-1.amazonaws.com/prod/'

/**
 * TD-065: the thunder-context deployment the AI chat talks to. Every
 * question, the whole tool-use loop and the model itself live behind
 * this URL now — the desktop holds no AWS credentials of its own.
 *
 * No trailing slash: request paths are appended with a leading `/`.
 */
export const DEFAULT_CONTEXT_URL = 'https://thunder-context.swaff.name/v1'

/**
 * TD-065: the dev-account thunder-context, paired with
 * {@link DEFAULT_DEV_API_URL} for the reason TD-066 documented for
 * halo-mcp — the service forwards the caller's Halo bearer token, so one
 * account's deployment cannot accept a token minted by the other.
 */
export const DEFAULT_DEV_CONTEXT_URL = 'https://thunder-context-dev.swaff.name/v1'

/**
 * TD-065: which thunder-context an unpackaged launch points at. Same
 * rule as {@link resolveDefaultApiUrl}, and deliberately sharing
 * {@link isDevLaunch} with it.
 */
export function resolveDefaultContextUrl(options: {
  isPackaged: boolean
  argv: readonly string[]
}): string {
  return isDevLaunch(options) ? DEFAULT_DEV_CONTEXT_URL : DEFAULT_CONTEXT_URL
}

/**
 * Persisted user-tunable settings.
 *
 * - `apiUrl`        — Halo backend the desktop client talks to. Tunable
 *                     so we can repoint at staging/local without a rebuild.
 * - `downloadFolder`— Destination for any future "save to disk" actions.
 * - `userAgent`     — Optional override for the embedded webview's UA
 *                     (needed for sites that 403 Electron's default).
 * - `contextUrl`    — TD-065: thunder-context deployment backing the AI chat.
 * - `chatEnabled`   — TD-052: master switch for the AI chat surface.
 *                     Ships `false`; TD-056 is what makes it visible.
 *
 * TD-065 removed `mcpUrl`, `bedrockRegion` and `bedrockModelId`: the
 * model, its region and the tool surface are the server's business now,
 * and per-machine copies of them were what TD-062 went wrong on.
 */
export interface ThunderSettings {
  apiUrl: string
  downloadFolder: string
  userAgent?: string
  contextUrl: string
  chatEnabled: boolean
}
