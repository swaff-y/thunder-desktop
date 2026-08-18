/**
 * TD-063: unpackaged runs get their own `userData` directory.
 *
 * The packaged bundle's `package.json` carries `name: "thunder-desktop"`
 * and no `productName` (that lives only in `electron-builder.yml`), so
 * `app.getName()` — and therefore `app.getPath('userData')` — is
 * identical in a dev run and in the installed app. Both were reading and
 * writing the same `thunder-desktop-settings.json`, which meant TD-060's
 * "unpackaged defaults to the dev backend" migration rewrote the
 * *installed* app's `apiUrl` to `halo-dev` every time `npm run dev` ran.
 * The packaged build keeps the legacy-only migration list on purpose, so
 * it never flipped the value back.
 *
 * Redirecting dev to `<userData>-dev` fixes that at the root: the two
 * runs can no longer see each other's settings, auth token, window state
 * or Chromium profile. The first dev launch copies the four files below
 * out of the shared directory so the redirect doesn't cost a re-login —
 * and because the copied `apiUrl` is still the prod default, TD-060's
 * `migrateApiUrl` flips it to the dev URL on that same launch, exactly
 * as it would have on a machine with no settings file at all.
 *
 * Kept free of the `electron` import so it stays unit-testable under
 * vitest's node environment (same split as `window-state` / `*-io`).
 * `index.ts` owns the `app.setPath` call.
 */

import { copyFileSync, existsSync, mkdirSync, statSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Filenames live here rather than next to their readers because this
 * module has to enumerate them, and a seed list that drifts from the
 * real paths fails silently — a dev run that quietly starts logged out
 * or with default settings.
 */
export const SETTINGS_FILENAME = 'thunder-desktop-settings.json'
export const WINDOW_STATE_FILENAME = 'thunder-desktop-window-state.json'
export const AUTH_CREDENTIALS_FILENAME = 'thunder-desktop-credentials.enc'
export const AWS_CREDENTIALS_FILENAME = 'thunder-desktop-aws.enc'

/**
 * Copied on first dev launch. Deliberately not the whole directory: the
 * Chromium profile (cookies, IndexedDB, the React Query cache) is left
 * behind so a dev session starts on a clean browser profile rather than
 * inheriting prod's logged-in sites.
 */
export const SEEDED_FILENAMES: ReadonlyArray<string> = [
  SETTINGS_FILENAME,
  WINDOW_STATE_FILENAME,
  AUTH_CREDENTIALS_FILENAME,
  AWS_CREDENTIALS_FILENAME
]

export const DEV_USERDATA_SUFFIX = '-dev'

/** `.../thunder-desktop` → `.../thunder-desktop-dev`. */
export function devUserDataPath(userDataPath: string): string {
  return `${userDataPath}${DEV_USERDATA_SUFFIX}`
}

/**
 * Ensures `targetDir` exists (Electron's `app.setPath('userData', ...)`
 * wants a real directory) and, the first time it is created, copies the
 * seeded files across from `sourceDir`.
 *
 * Copy only — never move or delete. The packaged app still reads the
 * source directory, and the entire point of the split is that a dev run
 * leaves it untouched.
 *
 * Returns `true` when it seeded, `false` when the target already
 * existed. An unreadable source file is logged and skipped rather than
 * thrown: a missing dev credential is a re-login, not a failed launch.
 */
export function ensureDevUserData(sourceDir: string, targetDir: string): boolean {
  const alreadyExists = existsSync(targetDir)
  // 0700 to match the mode Electron gives `userData` itself. The seeded
  // credential files are 0600, but the profile also accumulates
  // Chromium state and a 0644 window-state file — a world-traversable
  // dev profile would be a boundary this app doesn't otherwise relax.
  mkdirSync(targetDir, { recursive: true, mode: 0o700 })
  if (alreadyExists) return false

  for (const filename of SEEDED_FILENAMES) {
    const from = join(sourceDir, filename)
    try {
      if (!existsSync(from)) continue
      const to = join(targetDir, filename)
      copyFileSync(from, to)
      // `copyFileSync` creates the destination with default permissions,
      // so the encrypted credential files would land as 0644 — carry the
      // source mode across to keep them 0600.
      chmodSync(to, statSync(from).mode)
    } catch (error) {
      console.warn(`[userdata] could not seed ${filename} into the dev profile`, error)
    }
  }
  return true
}
