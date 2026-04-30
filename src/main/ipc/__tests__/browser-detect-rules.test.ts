import { describe, expect, it } from 'vitest'
import {
  getContentLength,
  getMimeType,
  getPathExtension,
  isVideoAsset
} from '../browser-detect-rules'

describe('browser-detect-rules (TD-022)', () => {
  // ─── getMimeType ──────────────────────────────────────────────────

  it('extracts the mime type without the charset suffix', () => {
    expect(getMimeType({ 'Content-Type': 'video/mp4; charset=utf-8' })).toBe('video/mp4')
  })

  it('looks up Content-Type case-insensitively', () => {
    expect(getMimeType({ 'content-type': 'video/webm' })).toBe('video/webm')
    expect(getMimeType({ 'CONTENT-TYPE': 'video/webm' })).toBe('video/webm')
  })

  it('handles array-valued headers (Electron normalises to arrays)', () => {
    expect(getMimeType({ 'content-type': ['application/x-mpegURL'] })).toBe('application/x-mpegURL')
  })

  it('returns null when no Content-Type header is present', () => {
    expect(getMimeType({})).toBeNull()
  })

  // ─── getContentLength ─────────────────────────────────────────────

  it('parses a valid Content-Length to a number', () => {
    expect(getContentLength({ 'content-length': '12345' })).toBe(12345)
  })

  it('returns undefined when Content-Length is absent or unparseable', () => {
    expect(getContentLength({})).toBeUndefined()
    expect(getContentLength({ 'content-length': 'banana' })).toBeUndefined()
  })

  // ─── getPathExtension ─────────────────────────────────────────────

  it('returns the lowercased extension from a URL pathname', () => {
    expect(getPathExtension('https://cdn.example/intro.MP4')).toBe('.mp4')
    expect(getPathExtension('https://cdn.example/x/y/master.m3u8?token=abc')).toBe('.m3u8')
  })

  it('ignores query-string dots', () => {
    expect(getPathExtension('https://cdn.example/path?v=1.2.3')).toBeNull()
  })

  it('returns null when there is no extension', () => {
    expect(getPathExtension('https://example.com/')).toBeNull()
    expect(getPathExtension('https://example.com/foo')).toBeNull()
  })

  it('returns null for an unparseable URL', () => {
    expect(getPathExtension('not a url')).toBeNull()
  })

  // ─── isVideoAsset (Content-Type rule) ─────────────────────────────

  it.each([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/x-mpegURL',
    'application/vnd.apple.mpegurl',
    'application/dash+xml'
  ])('flags %s as a video asset by content type', (mime) => {
    expect(isVideoAsset({ url: 'https://x/foo', headers: { 'content-type': mime } })).toBe(true)
  })

  it('does not flag image/audio/text mime types', () => {
    for (const mime of ['image/png', 'audio/mpeg', 'text/html', 'application/json']) {
      expect(isVideoAsset({ url: 'https://x/foo', headers: { 'content-type': mime } })).toBe(false)
    }
  })

  // ─── isVideoAsset (URL extension rule) ────────────────────────────

  it.each(['.mp4', '.webm', '.mkv', '.mov', '.m3u8', '.mpd'])(
    'flags pathname ending in %s',
    (ext) => {
      expect(
        isVideoAsset({
          url: `https://cdn.example/path/clip${ext}`,
          headers: { 'content-type': 'application/octet-stream' }
        })
      ).toBe(true)
    }
  )

  it('does NOT flag HLS .ts segments (manifest-only by design)', () => {
    expect(
      isVideoAsset({
        url: 'https://cdn.example/segments/seg-001.ts',
        headers: { 'content-type': 'video/MP2T' }
      })
    ).toBe(false)
  })

  it('does NOT flag DASH .m4s media segments', () => {
    expect(
      isVideoAsset({
        url: 'https://cdn.example/segments/seg-001.m4s',
        headers: { 'content-type': 'application/octet-stream' }
      })
    ).toBe(false)
  })

  it('flags an .mp4 even when the server sends a generic content type', () => {
    expect(
      isVideoAsset({
        url: 'https://cdn.example/intro.mp4',
        headers: { 'content-type': 'application/octet-stream' }
      })
    ).toBe(true)
  })

  it('flags an HLS manifest by content type even if the URL has no extension (signed URL pattern)', () => {
    expect(
      isVideoAsset({
        url: 'https://cdn.example/playlist?token=abc',
        headers: { 'content-type': 'application/vnd.apple.mpegurl' }
      })
    ).toBe(true)
  })

  it('returns false when neither rule matches', () => {
    expect(
      isVideoAsset({
        url: 'https://example.com/index.html',
        headers: { 'content-type': 'text/html' }
      })
    ).toBe(false)
  })
})
