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
 *   - accepts only `http(s)`, `data:` and `blob:` image sources — the
 *     same schemes a normal browser's "Save image" supports — and
 *     fails closed on anything else,
 *   - uses `pageURL` as the Referer header only when it parses as
 *     http(s); a malformed value is dropped silently rather than
 *     smuggled into an outbound request.
 *
 * Three save paths by scheme:
 *   - `http(s)` → streamed via the TD-024 pipeline (cookies + referer).
 *   - `data:`   → decoded in main, written as raw bytes.
 *   - `blob:`   → a `blob:` URL only resolves inside the renderer that
 *                 created it, so we `fetch` it via the guest's
 *                 `executeJavaScript`, ship the bytes back, and write
 *                 them. The URL is embedded with `JSON.stringify` so it
 *                 can't break out of the injected string literal.
 */

import { BrowserWindow, Menu, ipcMain, session, webContents } from 'electron'
import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { basename, extname } from 'node:path'
import { THUNDER_BROWSER_PARTITION } from '../../shared/browser'
import {
  THUNDER_IPC_CHANNELS,
  type ThunderBrowserContextMenuRequest,
  type ThunderContextMenuMediaType
} from '../../preload/thunder-api'
import type { BrowserDownloadHandlers } from './browser-download'
import {
  decodeImageDataUrl,
  imageFilenameFromMime,
  type DecodedImage
} from './browser-image-source'

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

type ImageScheme = 'http' | 'data' | 'blob'

/**
 * Classify an image `srcURL` into the scheme that decides how its bytes
 * are obtained. Returns null for anything we don't save (e.g. `file:`,
 * `chrome:`), so the menu fails closed.
 */
function imageScheme(srcUrl: string): ImageScheme | null {
  if (parseHttpUrl(srcUrl)) return 'http'
  if (srcUrl.startsWith('data:')) return 'data'
  if (srcUrl.startsWith('blob:')) return 'blob'
  return null
}

/**
 * Pull the bytes of a `blob:` image from the webview that owns it. A
 * `blob:` URL is scoped to its creating renderer, so main can't fetch
 * it — instead we run `fetch` in the guest's page context and ship the
 * bytes back base64-encoded. Returns null on any failure (CSP block,
 * revoked blob, non-image type), so the caller writes nothing.
 */
async function fetchBlobImage(guest: WebContents, srcUrl: string): Promise<DecodedImage | null> {
  if (guest.isDestroyed()) return null
  // srcUrl is embedded via JSON.stringify — it can't escape the string
  // literal. The chunked loop avoids a call-stack overflow that
  // String.fromCharCode(...bigArray) would hit on large images.
  const script = `(async () => {
    try {
      const res = await fetch(${JSON.stringify(srcUrl)});
      if (!res.ok) return null;
      const blob = await res.blob();
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk) {
        binary += String.fromCharCode.apply(null, buf.subarray(i, i + chunk));
      }
      return { base64: btoa(binary), mime: blob.type || 'application/octet-stream' };
    } catch (e) {
      return null;
    }
  })()`

  let result: unknown
  try {
    result = await guest.executeJavaScript(script)
  } catch {
    return null
  }
  if (!result || typeof result !== 'object') return null
  const { base64, mime } = result as { base64?: unknown; mime?: unknown }
  if (typeof base64 !== 'string' || typeof mime !== 'string') return null
  if (!mime.toLowerCase().startsWith('image/')) return null
  try {
    const bytes = Buffer.from(base64, 'base64')
    if (bytes.length === 0) return null
    return { bytes, mime }
  } catch {
    return null
  }
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
  const { startBrowserDownload, saveImageBytes } = deps
  const browserSession = session.fromPartition(THUNDER_BROWSER_PARTITION)

  async function saveImage(
    scheme: ImageScheme,
    request: ThunderBrowserContextMenuRequest,
    guest: WebContents
  ): Promise<void> {
    if (scheme === 'http') {
      // `imageScheme` already proved this parses as http(s).
      const parsedSrc = parseHttpUrl(request.srcURL)
      if (!parsedSrc) return
      const parsedPage = parseHttpUrl(request.pageURL)
      await startBrowserDownload({
        assetUrl: parsedSrc.toString(),
        suggestedFilename: deriveImageFilename(parsedSrc),
        referer: parsedPage ? parsedPage.toString() : undefined
      })
      return
    }

    const decoded =
      scheme === 'data'
        ? decodeImageDataUrl(request.srcURL)
        : await fetchBlobImage(guest, request.srcURL)
    if (!decoded) {
      // Malformed data: payload, non-image MIME, or an unresolvable
      // blob. Fail closed — nothing written — and log for diagnosis.
      console.error('[browser-context-menu] could not resolve image bytes for', scheme, 'URL')
      return
    }
    await saveImageBytes({
      bytes: decoded.bytes,
      suggestedFilename: imageFilenameFromMime(decoded.mime)
    })
  }

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
      // the source is a scheme we can save (http(s) / data: / blob:).
      // Anything else fails closed — no item surfaces.
      if (request.mediaType !== 'image') return
      const scheme = imageScheme(request.srcURL)
      if (scheme === null) return

      const menu = Menu.buildFromTemplate([
        {
          label: 'Save image',
          click: () => {
            void saveImage(scheme, request, guest).catch((error: unknown) => {
              // Failures after an `id` is minted surface to the drawer
              // via the complete event; failures before it (decode,
              // mkdir, write) have no drawer surface, so log them so
              // the failure is at least diagnosable from the console.
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
