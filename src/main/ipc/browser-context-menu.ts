/**
 * TD-047: native "Save image" context menu for the embedded Browser
 * tab.
 *
 * The renderer can't construct an Electron `Menu` (no `electron`
 * import in the renderer, per the boundary), so it forwards the
 * webview's `context-menu` params over IPC; this module gates the
 * request, builds a single-item native menu, and pops it. The click
 * handler calls back into the TD-024 download pipeline so the file
 * lands in the same downloads drawer as a detected-asset download —
 * progress, completion and "Show in Folder" all reuse that surface.
 *
 * Trust model: every field on the request is renderer-supplied and
 * therefore untrusted. The handler:
 *   - resolves `webContentsId` to a live `webContents` and checks its
 *     session against the Browser-tab partition (fail closed),
 *   - rejects non-`image` mediaType (no menu shown),
 *   - rejects `srcURL` that isn't http(s) — `data:` / `blob:` images
 *     wouldn't survive `browserDownloadStart`'s allow-list anyway, so
 *     failing closed here keeps the menu coherent with the pipeline,
 *   - uses `pageURL` as the Referer header only when it parses as
 *     http(s); a malformed value is dropped silently rather than
 *     smuggled into an outbound request.
 */

import { BrowserWindow, Menu, ipcMain, session, webContents } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { basename, extname } from 'node:path'
import { THUNDER_BROWSER_PARTITION } from '../../shared/browser'
import {
  THUNDER_IPC_CHANNELS,
  type ThunderBrowserContextMenuRequest,
  type ThunderContextMenuMediaType
} from '../../preload/thunder-api'
import type { BrowserDownloadHandlers } from './browser-download'

const DEFAULT_IMAGE_EXT = '.jpg'
const DEFAULT_IMAGE_BASENAME = 'image'

const MEDIA_TYPES: ReadonlySet<ThunderContextMenuMediaType> = new Set([
  'none',
  'image',
  'audio',
  'video',
  'canvas',
  'file',
  'plugin'
])

function isMediaType(value: unknown): value is ThunderContextMenuMediaType {
  return typeof value === 'string' && MEDIA_TYPES.has(value as ThunderContextMenuMediaType)
}

function parseRequest(args: unknown): ThunderBrowserContextMenuRequest | null {
  if (!args || typeof args !== 'object') return null
  const { webContentsId, mediaType, srcURL, pageURL } = args as Record<string, unknown>
  if (typeof webContentsId !== 'number' || !Number.isInteger(webContentsId)) return null
  if (!isMediaType(mediaType)) return null
  if (typeof srcURL !== 'string') return null
  if (typeof pageURL !== 'string') return null
  return { webContentsId, mediaType, srcURL, pageURL }
}

function parseHttpUrl(value: string): URL | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url
}

/**
 * Derive a save filename from the image URL's pathname. Falls back to
 * `image.jpg` when the path is empty (`/`) or has no usable basename.
 * Extension preserved when present; otherwise appended so the OS picks
 * a sensible "open with" handler.
 */
export function deriveImageFilename(srcUrl: URL): string {
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(srcUrl.pathname)
  } catch {
    decodedPath = srcUrl.pathname
  }
  const name = basename(decodedPath)
  if (name.length === 0 || name === '.' || name === '..') {
    return `${DEFAULT_IMAGE_BASENAME}${DEFAULT_IMAGE_EXT}`
  }
  return extname(name).length > 0 ? name : `${name}${DEFAULT_IMAGE_EXT}`
}

export function registerBrowserContextMenuHandlers(deps: BrowserDownloadHandlers): void {
  const { startBrowserDownload } = deps
  const browserSession = session.fromPartition(THUNDER_BROWSER_PARTITION)

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.browserContextMenuShow,
    async (_event: IpcMainInvokeEvent, args: unknown): Promise<void> => {
      const request = parseRequest(args)
      if (!request) return

      // Partition gate: resolve the claimed webContentsId and verify
      // it's the Browser-tab webview. `_event.sender` is the host
      // BrowserWindow (default session) and isn't validated here —
      // any current renderer that can reach this allow-listed channel
      // is trusted to send the request; the primary control is the
      // partition check below, which rejects any guest id pointing at
      // a webContents outside the Browser-tab session.
      const guest = webContents.fromId(request.webContentsId)
      if (!guest || guest.isDestroyed() || guest.session !== browserSession) return

      // AC3 + AC4: only image right-clicks get a menu, and only when
      // the source is an http(s) URL. data: / blob: simply don't
      // surface the item — no broken download attempt.
      if (request.mediaType !== 'image') return
      const parsedSrc = parseHttpUrl(request.srcURL)
      if (!parsedSrc) return

      const suggestedFilename = deriveImageFilename(parsedSrc)
      const parsedPage = parseHttpUrl(request.pageURL)
      const referer = parsedPage ? parsedPage.toString() : undefined

      const menu = Menu.buildFromTemplate([
        {
          label: 'Save image',
          click: () => {
            void startBrowserDownload({
              assetUrl: parsedSrc.toString(),
              suggestedFilename,
              referer
            }).catch((error: unknown) => {
              // Once `startBrowserDownload` has minted an `id`, failures
              // surface to the renderer via the download complete event
              // and become drawer entries. Errors that throw *before*
              // that (e.g. `mkdirSync` against an unmounted volume) have
              // no drawer surface and would otherwise be invisible —
              // log them so the failure is at least diagnosable from
              // the main-process console.
              console.error('[browser-context-menu] save image failed:', error)
            })
          }
        }
      ])

      // Anchor on the focused window. Electron picks the cursor
      // position by default, which is what the user expects from a
      // right-click. Skip when no window is focused (rare; e.g., the
      // user alt-tabbed between the right-click and the IPC landing).
      const window = BrowserWindow.getFocusedWindow()
      if (!window || window.isDestroyed()) return
      menu.popup({ window })
    }
  )
}
