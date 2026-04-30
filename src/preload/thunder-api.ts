import { ipcRenderer } from 'electron'

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
  authClear: 'thunder:auth:clear'
} as const

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
  email: string
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
}

export const thunderApi: ThunderApi = {
  auth: {
    get: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authGet),
    set: (creds) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authSet, creds),
    clear: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authClear)
  }
}
