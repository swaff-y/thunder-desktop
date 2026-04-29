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
  menuAction: 'thunder:menu:action'
} as const

/**
 * Union of every renderer-facing action the native menu can fire.
 * Empty in TD-002 — the channel exists but the menu's only non-role
 * items (New Window, Help → GitHub) are handled entirely in main.
 */
export type ThunderMenuAction = never

/**
 * Typed IPC surface for `window.thunder`. Empty in TD-001 — later tickets
 * (settings, dialog, browser-detect, browser-download, …) hang their
 * channels off this object.
 */
export interface ThunderApi {
  _placeholder?: never
}

export const thunderApi: ThunderApi = {}
