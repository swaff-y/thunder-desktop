/**
 * TD-047: resolve image bytes from the non-network schemes a normal
 * browser's "Save image" supports — `data:` — for the embedded Browser
 * tab's context menu, plus the MIME → extension mapping shared with the
 * `blob:` path.
 *
 * `http(s)` images go through the TD-024 download pipeline (cookies +
 * referer, streamed to disk). `data:` payloads are embedded in the URL
 * and decoded here in main. `blob:` bytes can't be decoded here (a
 * `blob:` URL only resolves inside the renderer that created it); the
 * context-menu handler fetches them in the owning webview and then
 * writes them via the same raw-bytes path, reusing `imageFilenameFromMime`.
 */

const IMAGE_MIME_EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/avif': 'avif',
  'image/tiff': 'tiff',
  'image/heic': 'heic',
  'image/heif': 'heif'
}

const DEFAULT_EXT = 'jpg'
const DEFAULT_BASENAME = 'image'

export interface DecodedImage {
  bytes: Buffer
  mime: string
}

/**
 * Map an image MIME type to a file extension (no dot). Known types use
 * a curated table; anything else falls back to the MIME subtype
 * (`image/x-foo` → `foo`, `image/svg+xml` → `svg`) and finally to
 * `jpg` so a saved file always has a plausible extension.
 */
export function imageMimeToExtension(mime: string): string {
  const normalized = mime.trim().toLowerCase()
  const known = IMAGE_MIME_EXT[normalized]
  if (known) return known
  if (normalized.startsWith('image/')) {
    const sub = normalized.slice('image/'.length).split(';')[0].split('+')[0].replace(/^x-/, '')
    if (/^[a-z0-9.-]+$/.test(sub)) return sub
  }
  return DEFAULT_EXT
}

/** `image.<ext>` for a saved data:/blob: image, keyed off its MIME. */
export function imageFilenameFromMime(mime: string): string {
  return `${DEFAULT_BASENAME}.${imageMimeToExtension(mime)}`
}

/**
 * Decode a `data:` image URL into raw bytes. Returns `null` (fail
 * closed) for non-`data:` URLs, a malformed payload, or a non-image
 * MIME — the caller writes nothing in that case.
 *
 * Form: `data:[<mediatype>][;base64],<data>`. base64 payloads decode
 * directly; non-base64 payloads are percent-encoded text (e.g. inline
 * SVG) and are decoded as UTF-8.
 */
export function decodeImageDataUrl(srcUrl: string): DecodedImage | null {
  if (!srcUrl.startsWith('data:')) return null
  const comma = srcUrl.indexOf(',')
  if (comma === -1) return null

  const meta = srcUrl.slice('data:'.length, comma)
  const payload = srcUrl.slice(comma + 1)
  const segments = meta.split(';')
  const mime = (segments[0] ?? '').trim().toLowerCase() || 'text/plain'
  if (!mime.startsWith('image/')) return null

  const isBase64 = segments.some((s) => s.trim().toLowerCase() === 'base64')
  try {
    const bytes = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8')
    if (bytes.length === 0) return null
    return { bytes, mime }
  } catch {
    return null
  }
}
