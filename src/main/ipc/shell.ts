/**
 * TD-021: renderer → main bridge for `shell.openExternal`. The
 * embedded `<webview>` in the Browser tab catches `new-window` events
 * for non-`http(s)` URLs (`mailto:`, `tel:`, etc.) and asks main to
 * hand them to the OS. The renderer never touches `electron.shell`
 * directly — every URL passes through {@link openExternalIfAllowed}'s
 * allowlist so a compromised page can't drive arbitrary local handlers
 * (`file:`, `javascript:`, `chrome:`).
 *
 * Lifted from halo-desktop's `window.ts`; the allowlist is broader
 * here because this path serves user-clicked links inside the embedded
 * browser (where `mailto:`/`tel:` are legitimate), not the chrome's
 * own window-open handler.
 */

import { ipcMain, shell } from 'electron'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'

const ALLOWED_EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:'])

export function openExternalIfAllowed(rawUrl: string): boolean {
  try {
    const { protocol } = new URL(rawUrl)
    if (ALLOWED_EXTERNAL_SCHEMES.has(protocol)) {
      void shell.openExternal(rawUrl)
      return true
    }
    console.warn(`[shell] blocked external navigation to disallowed scheme: ${protocol}`)
    return false
  } catch {
    console.warn(`[shell] blocked external navigation to unparseable URL: ${rawUrl}`)
    return false
  }
}

export function registerShellHandlers(): void {
  ipcMain.handle(THUNDER_IPC_CHANNELS.shellOpenExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('[shell] open-external requires a non-empty string URL')
    }
    return openExternalIfAllowed(url)
  })
}
