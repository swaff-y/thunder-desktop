/**
 * Typed IPC surface for `window.thunder`. Empty in TD-001 — later tickets
 * (settings, dialog, browser-detect, browser-download, …) hang their
 * channels off this object.
 */
export interface ThunderApi {
  _placeholder?: never
}

export const thunderApi: ThunderApi = {}
