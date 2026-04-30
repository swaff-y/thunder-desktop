/**
 * Renderer-side environment config. The canonical `apiUrl` lives in
 * the main-process settings store (TD-018); this module fetches it
 * over IPC at boot via {@link bootstrapEnv} and then exposes a sync
 * `API_URL` that the rest of the renderer (axios baseURL, template
 * literals) can use without awaiting.
 *
 * Bootstrap is awaited from `main.tsx` before the React tree mounts,
 * so by the time `client.ts` runs `axios.create({ baseURL: API_URL })`,
 * `API_URL` already reflects the persisted setting. Falls back to
 * {@link DEFAULT_API_URL} when IPC is unavailable (vitest, dev tools
 * harness, etc.) so tests don't have to stub `window.thunder`.
 */

import { DEFAULT_API_URL } from '../../../shared/settings'

// `let` + ESM live binding: consumers `import { API_URL }` and see
// reassignments made inside this module. `bootstrapEnv` is the only
// writer; everywhere else treats it as read-only.
export let API_URL: string = DEFAULT_API_URL

export async function bootstrapEnv(): Promise<void> {
  try {
    const url = await window.thunder?.settings.get('apiUrl')
    if (typeof url === 'string' && url.length > 0) {
      API_URL = url
    }
  } catch {
    // IPC failure (or no thunder bridge in tests) — keep the default.
  }
}
