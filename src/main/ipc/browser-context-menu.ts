/**
 * TD-047: native context menu for the embedded Browser tab. TD-091
 * added its second item.
 *
 * The renderer can't construct an Electron `Menu` (no `electron`
 * import in the renderer, per the boundary), so it forwards the
 * webview's `context-menu` params over IPC; this module gates the
 * request, builds a native menu from whatever the params support, and
 * pops it. "Save image" calls back into the TD-024 download pipeline so
 * the file lands in the same downloads drawer as a detected-asset
 * download — progress, completion and "Show in Folder" all reuse that
 * surface.
 *
 * "Open link in new tab" finishes somewhere main cannot reach: the tab
 * strip is `useBrowserTabs`, renderer state. So the invoke resolves
 * with the chosen item rather than acting on it, and the renderer opens
 * the tab — one channel, and no second copy of the tab-open path.
 *
 * Trust model: every field on the request is renderer-supplied and
 * therefore untrusted. The handler:
 *   - resolves `webContentsId` to a live `webContents` and checks its
 *     session against the Browser-tab partition (fail closed),
 *   - offers "Save image" only for an `image` mediaType whose source
 *     is `http(s)`, `data:` or `blob:` — the same schemes a normal
 *     browser's "Save image" supports — and fails closed otherwise,
 *   - offers "Open link in new tab" only for an `http(s)` `linkURL`,
 *     so a `javascript:` or `file:` link gets no item and no menu,
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
import type { IpcMainInvokeEvent, MenuItemConstructorOptions, WebContents } from 'electron'
import { basename, extname } from 'node:path'
import { THUNDER_BROWSER_PARTITION } from '../../shared/browser'
import {
  THUNDER_IPC_CHANNELS,
  type ThunderBrowserContextMenuRequest,
  type ThunderContextMenuMediaType,
  type ThunderContextMenuResult
} from '../../preload/thunder-api'
import type { BrowserDownloadHandlers } from './browser-download'
import {
  decodeImageDataUrl,
  imageFilenameFromMime,
  type DecodedImage
} from './browser-image-source'

const DEFAULT_IMAGE_EXT = '.jpg'
const DEFAULT_IMAGE_BASENAME = 'image'

// Handed back by reference from every refusal path, so frozen rather
// than trusted not to be mutated.
const NONE: ThunderContextMenuResult = Object.freeze({ action: 'none' })

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
  const { webContentsId, mediaType, srcURL, pageURL, linkURL } = args as Record<string, unknown>
  if (typeof webContentsId !== 'number' || !Number.isInteger(webContentsId)) return null
  if (!isMediaType(mediaType)) return null
  if (typeof srcURL !== 'string') return null
  if (typeof pageURL !== 'string') return null
  if (typeof linkURL !== 'string') return null
  return { webContentsId, mediaType, srcURL, pageURL, linkURL }
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
    async (_event: IpcMainInvokeEvent, args: unknown): Promise<ThunderContextMenuResult> => {
      const request = parseRequest(args)
      if (!request) return NONE

      // Partition gate: resolve the claimed webContentsId and verify
      // it's the Browser-tab webview. `_event.sender` is the host
      // BrowserWindow (default session) and isn't validated here —
      // any current renderer that can reach this allow-listed channel
      // is trusted to send the request; the primary control is the
      // partition check below, which rejects any guest id pointing at
      // a webContents outside the Browser-tab session.
      const guest = webContents.fromId(request.webContentsId)
      if (!guest || guest.isDestroyed() || guest.session !== browserSession) return NONE

      // TD-091 AC6 + TD-047 AC3/AC4: each item is offered only when the
      // params can actually support it — an `http(s)` link, an image
      // whose source is a scheme we can save. A right-click on neither
      // pops no menu at all.
      const link = parseHttpUrl(request.linkURL)
      const scheme = request.mediaType === 'image' ? imageScheme(request.srcURL) : null
      if (!link && scheme === null) return NONE

      // Anchor on the focused window. Electron picks the cursor
      // position by default, which is what the user expects from a
      // right-click. Skip when no window is focused (rare; e.g., the
      // user alt-tabbed between the right-click and the IPC landing).
      const window = BrowserWindow.getFocusedWindow()
      if (!window || window.isDestroyed()) return NONE

      // A click fires before `popup`'s close callback, so the chosen item
      // always resolves first and the `NONE` behind it is the no-op a
      // second `resolve` always is. A dismissed menu fires the callback
      // alone, which is what makes `NONE` the right thing to send there.
      return await new Promise<ThunderContextMenuResult>((resolve) => {
        const template: MenuItemConstructorOptions[] = []
        if (link) {
          // Chrome's order: the link first, then the image under it.
          template.push({
            label: 'Open link in new tab',
            click: () => resolve({ action: 'open-in-new-tab', url: link.toString() })
          })
        }
        if (scheme !== null) {
          if (template.length > 0) template.push({ type: 'separator' })
          template.push({
            label: 'Save image',
            click: () => {
              // Main finishes this one itself, so the renderer is told
              // there is nothing left for it to do.
              resolve(NONE)
              void saveImage(scheme, request, guest).catch((error: unknown) => {
                // Failures after an `id` is minted surface to the drawer
                // via the complete event; failures before it (decode,
                // mkdir, write) have no drawer surface, so log them so
                // the failure is at least diagnosable from the console.
                console.error('[browser-context-menu] save image failed:', error)
              })
            }
          })
        }

        Menu.buildFromTemplate(template).popup({
          window,
          callback: () => resolve(NONE)
        })
      })
    }
  )
}
