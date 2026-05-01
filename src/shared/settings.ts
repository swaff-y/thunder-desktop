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
 * Default Halo prod URL (TD-029 cutover). Single source of truth —
 * main writes it into the settings file on first launch, renderer
 * falls back to it when IPC is unavailable (vitest, dev tools
 * harness, etc.). Keeping this literal in two places used to drift;
 * do not duplicate it.
 */
export const DEFAULT_API_URL =
  'https://iunjwmwjv0.execute-api.ap-south-1.amazonaws.com/prod/'

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
 * Persisted user-tunable settings.
 *
 * - `apiUrl`        — Halo backend the desktop client talks to. Tunable
 *                     so we can repoint at staging/local without a rebuild.
 * - `downloadFolder`— Destination for any future "save to disk" actions.
 * - `userAgent`     — Optional override for the embedded webview's UA
 *                     (needed for sites that 403 Electron's default).
 */
export interface ThunderSettings {
  apiUrl: string
  downloadFolder: string
  userAgent?: string
}
