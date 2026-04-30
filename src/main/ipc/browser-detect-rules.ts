/**
 * TD-022: pure helpers for video-asset detection. Split from the
 * Electron-bound `browser-detect.ts` so the predicate can be unit
 * tested in vitest's node project without dragging in the `electron`
 * runtime.
 */

const VIDEO_CONTENT_TYPE_RE = /^(video\/|application\/(x-mpegURL|vnd\.apple\.mpegurl|dash\+xml))/i

const VIDEO_PATH_EXTENSIONS: ReadonlySet<string> = new Set([
  '.mp4',
  '.webm',
  '.mkv',
  '.mov',
  '.m3u8',
  '.mpd'
])

// Segment extensions that override a positive Content-Type match.
// HLS `.ts` segments are served as `video/MP2T` and would otherwise
// satisfy the `^video/` rule, but per AC2 we only want the `.m3u8`
// manifest, not the hundreds of segment fetches that follow.
const SEGMENT_PATH_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.m4s'])

export type ResponseHeaders = Record<string, string | string[] | undefined>

/**
 * Header lookup is case-insensitive (Electron lowercases keys, but
 * the spec doesn't require it and a fixture-based test is much easier
 * to read if the helper handles either casing). The `;`-suffix carries
 * `charset=` and friends; trim it so the predicate sees just the type.
 */
export function getHeader(headers: ResponseHeaders, name: string): string | null {
  const target = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== target) continue
    const raw = headers[key]
    const value = Array.isArray(raw) ? raw[0] : raw
    return typeof value === 'string' && value.length > 0 ? value : null
  }
  return null
}

export function getMimeType(headers: ResponseHeaders): string | null {
  const raw = getHeader(headers, 'content-type')
  if (raw === null) return null
  const semi = raw.indexOf(';')
  return (semi === -1 ? raw : raw.slice(0, semi)).trim() || null
}

export function getContentLength(headers: ResponseHeaders): number | undefined {
  const raw = getHeader(headers, 'content-length')
  if (raw === null) return undefined
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function getPathExtension(rawUrl: string): string | null {
  let pathname: string
  try {
    pathname = new URL(rawUrl).pathname
  } catch {
    return null
  }
  const lastSlash = pathname.lastIndexOf('/')
  const tail = lastSlash === -1 ? pathname : pathname.slice(lastSlash + 1)
  const dot = tail.lastIndexOf('.')
  if (dot <= 0) return null
  return tail.slice(dot).toLowerCase()
}

export interface DetectionInput {
  url: string
  headers: ResponseHeaders
}

export function isVideoAsset({ url, headers }: DetectionInput): boolean {
  const ext = getPathExtension(url)
  if (ext !== null && SEGMENT_PATH_EXTENSIONS.has(ext)) return false
  const mime = getMimeType(headers)
  if (mime !== null && VIDEO_CONTENT_TYPE_RE.test(mime)) return true
  if (ext !== null && VIDEO_PATH_EXTENSIONS.has(ext)) return true
  return false
}
