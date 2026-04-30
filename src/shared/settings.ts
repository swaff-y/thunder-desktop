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
 * Default Halo dev URL. Single source of truth — main writes it into
 * the settings file on first launch, renderer falls back to it when
 * IPC is unavailable (vitest, dev tools harness, etc.). Keeping this
 * literal in two places used to drift; do not duplicate it.
 */
export const DEFAULT_API_URL =
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
