/**
 * TD-037: pure helpers for the HLS-to-MP4 download branch. Kept free
 * of `electron`, `child_process`, and `node:fs` so the predicates and
 * parsers stay unit-testable under vitest's node project (mirrors the
 * browser-detect-rules / browser-download-path split).
 */

import { getPathExtension } from './browser-detect-rules'

const HLS_MIME_RE = /^application\/(x-mpegURL|vnd\.apple\.mpegurl)$/i

export interface HlsDetectionInput {
  url: string
  mimeType?: string | null
}

export function isHlsManifest({ url, mimeType }: HlsDetectionInput): boolean {
  if (typeof mimeType === 'string' && HLS_MIME_RE.test(mimeType)) return true
  return getPathExtension(url) === '.m3u8'
}

/**
 * Force the target extension to `.mp4` because ffmpeg writes a single
 * remuxed file regardless of the manifest extension. Caller is
 * responsible for stripping query / path components beforehand —
 * `basename(suggestedFilename)` upstream already does that.
 */
export function rewriteM3u8ToMp4(filename: string): string {
  const stripped = filename.replace(/\.m3u8$/i, '')
  return `${stripped}.mp4`
}

/**
 * `electron-builder`'s `asarUnpack` rule relocates matching files
 * from `app.asar` to `app.asar.unpacked` at install time, but
 * `ffmpeg-static`'s exported path is computed at module load and
 * still references the (non-existent) inside-asar location. The
 * spawn target needs the rewritten path. In dev (`isPackaged=false`)
 * the binary lives at the original `node_modules/ffmpeg-static/...`
 * path and no rewrite is needed.
 */
export function rewriteAsarPathToUnpacked(path: string, isPackaged: boolean): string {
  return isPackaged ? path.replace('app.asar', 'app.asar.unpacked') : path
}

export interface FfmpegProgressKv {
  key: string
  value: string
}

/**
 * Parses one `key=value` line from ffmpeg's `-progress pipe:1` output.
 * Returns `null` for blank lines or lines without an `=` (ffmpeg
 * occasionally emits trailing whitespace-only lines between blocks).
 */
export function parseFfmpegProgressLine(line: string): FfmpegProgressKv | null {
  const trimmed = line.trim()
  if (trimmed.length === 0) return null
  const eq = trimmed.indexOf('=')
  if (eq <= 0) return null
  return {
    key: trimmed.slice(0, eq).trim(),
    value: trimmed.slice(eq + 1).trim()
  }
}

/**
 * Extracts the manifest duration in microseconds from a stderr line
 * like `  Duration: 00:01:23.45, start: 0.000000, bitrate: …`.
 * Returns `null` for any line that doesn't carry a Duration field.
 *
 * ffmpeg prints this line near the start of the run (after probing
 * the input), so callers should latch the first non-null result and
 * stop parsing once a value is captured.
 */
export function parseFfmpegDurationLine(line: string): number | null {
  const match = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i)
  if (match === null) return null
  const hours = Number.parseInt(match[1], 10)
  const minutes = Number.parseInt(match[2], 10)
  const seconds = Number.parseFloat(match[3])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null
  }
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1_000_000)
}

/**
 * Synthesises a `totalBytes` estimate for a duration-based progress
 * bar: `receivedBytes / progressFraction` where progress is
 * `elapsedUs / durationUs`. As the download nears completion the
 * estimate converges to the true file size, so the renderer's
 * "X MB / Y MB" label remains roughly honest while the bar fills
 * left-to-right.
 *
 * Returns `0` (indeterminate sentinel) when any input is missing or
 * non-positive, so the renderer falls back to the shimmer animation.
 */
export function estimateHlsTotalBytes(
  receivedBytes: number,
  elapsedUs: number,
  durationUs: number
): number {
  if (
    !Number.isFinite(receivedBytes) ||
    receivedBytes <= 0 ||
    !Number.isFinite(elapsedUs) ||
    elapsedUs <= 0 ||
    !Number.isFinite(durationUs) ||
    durationUs <= 0
  ) {
    return 0
  }
  if (elapsedUs >= durationUs) return receivedBytes
  return Math.round((receivedBytes * durationUs) / elapsedUs)
}

export interface HeaderCookie {
  name: string
  value: string
}

/**
 * Builds the value for ffmpeg's `-headers` flag: a single string of
 * `Key: Value` pairs joined by CRLF. ffmpeg parses the input by
 * splitting on `\r\n`, so the trailing terminator is optional.
 *
 * Hostile cookie / header values are dropped: CRLF defuses header
 * injection (a malicious cookie can't smuggle a forged `Authorization`
 * line), and `;` in a cookie value would corrupt the `name=value;
 * name=value` framing of the Cookie header itself.
 */
export function buildFfmpegHeadersString(
  cookies: ReadonlyArray<HeaderCookie>,
  userAgent?: string,
  referer?: string
): string {
  const lines: string[] = []
  const safeCookies = cookies.filter(isCookieSafe).map((c) => `${c.name}=${c.value}`)
  if (safeCookies.length > 0) {
    lines.push(`Cookie: ${safeCookies.join('; ')}`)
  }
  if (typeof userAgent === 'string' && userAgent.length > 0 && !containsCrlf(userAgent)) {
    lines.push(`User-Agent: ${userAgent}`)
  }
  if (typeof referer === 'string' && referer.length > 0 && !containsCrlf(referer)) {
    lines.push(`Referer: ${referer}`)
  }
  return lines.join('\r\n')
}

function isCookieSafe(c: HeaderCookie): boolean {
  if (containsCrlf(c.name) || containsCrlf(c.value)) return false
  // `;` and `,` are RFC 6265 cookie-string separators — a value
  // containing either would split a single cookie into two on the
  // server side. `=` in the name would do the same to the boundary
  // between name and value.
  if (c.name.includes('=') || c.name.includes(';') || c.name.includes(',')) return false
  if (c.value.includes(';') || c.value.includes(',')) return false
  return true
}

function containsCrlf(s: string): boolean {
  return s.includes('\r') || s.includes('\n')
}
