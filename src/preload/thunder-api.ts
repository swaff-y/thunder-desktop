import { ipcRenderer } from 'electron'
import type { ThunderSettings } from '../shared/settings'

export type { ThunderSettings }

/**
 * IPC channels exposed across the main / preload / renderer boundary.
 * Centralised so main-process senders and the renderer's
 * `window.thunder.*` consumers can't drift on string literals.
 */
export const THUNDER_IPC_CHANNELS = {
  /**
   * Native menu → renderer fan-out. Payload is a {@link ThunderMenuAction}.
   * Future tickets that add custom menu items wire them here; the v1
   * scaffold has no actions yet.
   *
   * NOTE: the renderer-side subscription helper (`window.thunder.menu.onAction`,
   * mirroring halo-desktop's pattern) is intentionally deferred — it
   * has nothing to listen for while {@link ThunderMenuAction} is `never`.
   * The first ticket that adds a real action should also add the
   * `ipcRenderer.on` bridge in `preload/index.ts` and the `menu` key
   * on {@link ThunderApi}.
   */
  menuAction: 'thunder:menu:action',

  /**
   * TD-030: encrypted credential store. The renderer NEVER touches the
   * credential file or `safeStorage` directly — these channels are the
   * only path. Main-process handlers are registered in `main/ipc/auth.ts`.
   */
  authGet: 'thunder:auth:get',
  authSet: 'thunder:auth:set',
  authClear: 'thunder:auth:clear',

  /**
   * TD-018: JSON-backed settings store at `<userData>/thunder-desktop-settings.json`.
   * Main-process handlers are registered in `main/ipc/settings.ts`.
   */
  settingsGet: 'thunder:settings:get',
  settingsSet: 'thunder:settings:set',
  settingsGetAll: 'thunder:settings:get-all'
} as const

/**
 * The set of channels the renderer is permitted to invoke through the
 * generic `window.thunder.invoke` escape hatch. Anything outside this
 * list is rejected in the preload before reaching `ipcRenderer.invoke`,
 * so an attacker who somehow obtained a renderer handle still can't
 * drive arbitrary main-process IPC.
 *
 * `menuAction` is intentionally excluded — it's a one-way main →
 * renderer channel, not invoke-able. Add new channels here as their
 * handlers ship.
 */
export const THUNDER_ALLOWLIST: ReadonlyArray<string> = [
  THUNDER_IPC_CHANNELS.authGet,
  THUNDER_IPC_CHANNELS.authSet,
  THUNDER_IPC_CHANNELS.authClear,
  THUNDER_IPC_CHANNELS.settingsGet,
  THUNDER_IPC_CHANNELS.settingsSet,
  THUNDER_IPC_CHANNELS.settingsGetAll
]

/**
 * Union of every renderer-facing action the native menu can fire.
 * Empty in TD-002 — the channel exists but the menu's only non-role
 * items (New Window, Help → GitHub) are handled entirely in main.
 */
export type ThunderMenuAction = never

/**
 * TD-030: shape of credentials persisted via the keychain. `password` is
 * present iff the user opted into "Stay signed in" — its presence is
 * what enables silent reauth on token expiry.
 */
export interface ThunderAuthCredentials {
  token: string
  apiKey: string
  /** Optional — pre-TD-030 migrations only carry token + apiKey.
   *  Required for silent reauth; absence simply means no auto-refresh. */
  email?: string
  /** Present iff "Stay signed in" was checked at login time. */
  password?: string
}

/**
 * Typed IPC surface for `window.thunder`.
 */
export interface ThunderApi {
  auth: {
    get: () => Promise<ThunderAuthCredentials | null>
    set: (creds: ThunderAuthCredentials) => Promise<void>
    clear: () => Promise<void>
  }
  settings: {
    get: <K extends keyof ThunderSettings>(key: K) => Promise<ThunderSettings[K]>
    set: <K extends keyof ThunderSettings>(key: K, value: ThunderSettings[K]) => Promise<void>
    getAll: () => Promise<ThunderSettings>
  }
  /**
   * Generic IPC escape hatch, gated by {@link THUNDER_ALLOWLIST}.
   * Prefer the typed `auth` / `settings` surfaces — `invoke` exists so
   * tests can prove the allowlist rejects arbitrary channels and so
   * future spike code has a forward path before its typed surface lands.
   */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export const thunderApi: ThunderApi = {
  auth: {
    get: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authGet),
    set: (creds) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authSet, creds),
    clear: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authClear)
  },
  settings: {
    get: (key) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.settingsGet, key),
    set: (key, value) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.settingsSet, key, value),
    getAll: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.settingsGetAll)
  },
  invoke: (channel, ...args) => {
    if (!THUNDER_ALLOWLIST.includes(channel)) {
      return Promise.reject(
        new Error(`[thunder] channel "${channel}" is not in the Thunder IPC allowlist`)
      )
    }
    return ipcRenderer.invoke(channel, ...args)
  }
}
