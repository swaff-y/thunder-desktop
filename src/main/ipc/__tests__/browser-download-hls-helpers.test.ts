import { describe, expect, it } from 'vitest'
import {
  buildFfmpegHeadersString,
  isHlsManifest,
  parseFfmpegProgressLine,
  rewriteAsarPathToUnpacked,
  rewriteM3u8ToMp4
} from '../browser-download-hls-helpers'

describe('isHlsManifest', () => {
  it('returns true for a URL whose pathname ends in .m3u8', () => {
    expect(isHlsManifest({ url: 'https://cdn.example.com/v/clip.m3u8' })).toBe(true)
  })

  it('matches case-insensitively on the path extension', () => {
    expect(isHlsManifest({ url: 'https://cdn.example.com/v/CLIP.M3U8' })).toBe(true)
  })

  it('ignores the query string when checking the path extension', () => {
    expect(isHlsManifest({ url: 'https://cdn.example.com/v/clip.m3u8?token=abc' })).toBe(true)
  })

  it('returns true for application/x-mpegURL mime type even with no .m3u8 path', () => {
    expect(
      isHlsManifest({
        url: 'https://cdn.example.com/v/playlist',
        mimeType: 'application/x-mpegURL'
      })
    ).toBe(true)
  })

  it('returns true for application/vnd.apple.mpegurl mime type', () => {
    expect(
      isHlsManifest({
        url: 'https://cdn.example.com/v/playlist',
        mimeType: 'application/vnd.apple.mpegurl'
      })
    ).toBe(true)
  })

  it('returns false for a .mp4 URL with no matching mime type', () => {
    expect(isHlsManifest({ url: 'https://cdn.example.com/v/clip.mp4' })).toBe(false)
  })

  it('returns false for an unparseable URL', () => {
    expect(isHlsManifest({ url: 'not a url' })).toBe(false)
  })

  it('returns false for an empty mimeType + non-matching URL', () => {
    expect(isHlsManifest({ url: 'https://x/clip.mp4', mimeType: '' })).toBe(false)
  })
})

describe('rewriteM3u8ToMp4', () => {
  it('rewrites clip.m3u8 → clip.mp4', () => {
    expect(rewriteM3u8ToMp4('clip.m3u8')).toBe('clip.mp4')
  })

  it('is case-insensitive on the extension', () => {
    expect(rewriteM3u8ToMp4('CLIP.M3U8')).toBe('CLIP.mp4')
  })

  it('appends .mp4 when no .m3u8 extension is present', () => {
    expect(rewriteM3u8ToMp4('clip')).toBe('clip.mp4')
  })

  it('does not strip non-m3u8 extensions', () => {
    expect(rewriteM3u8ToMp4('archive.tar')).toBe('archive.tar.mp4')
  })
})

describe('parseFfmpegProgressLine', () => {
  it('parses out_time_ms=12345', () => {
    expect(parseFfmpegProgressLine('out_time_ms=12345')).toEqual({
      key: 'out_time_ms',
      value: '12345'
    })
  })

  it('parses total_size=67890', () => {
    expect(parseFfmpegProgressLine('total_size=67890')).toEqual({
      key: 'total_size',
      value: '67890'
    })
  })

  it('parses progress=end', () => {
    expect(parseFfmpegProgressLine('progress=end')).toEqual({
      key: 'progress',
      value: 'end'
    })
  })

  it('returns null for a line with no = sign', () => {
    expect(parseFfmpegProgressLine('garbage line')).toBeNull()
  })

  it('returns null for an empty / whitespace line', () => {
    expect(parseFfmpegProgressLine('')).toBeNull()
    expect(parseFfmpegProgressLine('   ')).toBeNull()
  })

  it('strips whitespace around the key and value', () => {
    expect(parseFfmpegProgressLine('  total_size  =  4096  ')).toEqual({
      key: 'total_size',
      value: '4096'
    })
  })

  it('returns null when the line starts with =', () => {
    expect(parseFfmpegProgressLine('=oops')).toBeNull()
  })
})

describe('buildFfmpegHeadersString', () => {
  it('returns Cookie + User-Agent joined by CRLF', () => {
    expect(
      buildFfmpegHeadersString(
        [
          { name: 'sid', value: 'abc' },
          { name: 'csrf', value: 'xyz' }
        ],
        'Mozilla/5.0'
      )
    ).toBe('Cookie: sid=abc; csrf=xyz\r\nUser-Agent: Mozilla/5.0')
  })

  it('omits the Cookie header when no cookies are present', () => {
    expect(buildFfmpegHeadersString([], 'Mozilla/5.0')).toBe('User-Agent: Mozilla/5.0')
  })

  it('omits the User-Agent header when not provided', () => {
    expect(buildFfmpegHeadersString([{ name: 'sid', value: 'abc' }])).toBe('Cookie: sid=abc')
  })

  it('includes Referer when provided', () => {
    expect(buildFfmpegHeadersString([], 'UA/1', 'https://example.com/page')).toBe(
      'User-Agent: UA/1\r\nReferer: https://example.com/page'
    )
  })

  it('drops cookies whose name or value contains CRLF (header injection guard)', () => {
    expect(
      buildFfmpegHeadersString(
        [
          { name: 'sid', value: 'abc' },
          { name: 'evil', value: 'x\r\nAuthorization: Bearer stolen' }
        ],
        'UA/1'
      )
    ).toBe('Cookie: sid=abc\r\nUser-Agent: UA/1')
  })

  it('drops cookies whose value contains ; or , (Cookie-string framing guard)', () => {
    expect(
      buildFfmpegHeadersString(
        [
          { name: 'sid', value: 'abc' },
          { name: 'bad', value: 'x; y=stolen' },
          { name: 'worse', value: 'x, y' }
        ],
        'UA/1'
      )
    ).toBe('Cookie: sid=abc\r\nUser-Agent: UA/1')
  })

  it('drops cookies whose name contains = ; or ,', () => {
    expect(
      buildFfmpegHeadersString(
        [
          { name: 'sid', value: 'abc' },
          { name: 'na=me', value: 'x' },
          { name: 'na;me', value: 'x' },
          { name: 'na,me', value: 'x' }
        ],
        'UA/1'
      )
    ).toBe('Cookie: sid=abc\r\nUser-Agent: UA/1')
  })

  it('drops a User-Agent or Referer that contains CRLF', () => {
    expect(buildFfmpegHeadersString([], 'UA/1\r\nX-Injected: 1', 'https://x\r\nX-Y: 1')).toBe('')
  })

  it('returns an empty string when nothing is forwardable', () => {
    expect(buildFfmpegHeadersString([])).toBe('')
  })
})

describe('rewriteAsarPathToUnpacked', () => {
  it('returns the path unchanged when isPackaged=false', () => {
    expect(
      rewriteAsarPathToUnpacked('/Users/me/proj/node_modules/ffmpeg-static/ffmpeg', false)
    ).toBe('/Users/me/proj/node_modules/ffmpeg-static/ffmpeg')
  })

  it('rewrites app.asar → app.asar.unpacked when isPackaged=true', () => {
    expect(
      rewriteAsarPathToUnpacked(
        '/Applications/Thunder.app/Contents/Resources/app.asar/node_modules/ffmpeg-static/ffmpeg',
        true
      )
    ).toBe(
      '/Applications/Thunder.app/Contents/Resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg'
    )
  })

  it('leaves a path with no app.asar segment unchanged when isPackaged=true', () => {
    expect(rewriteAsarPathToUnpacked('/usr/local/bin/ffmpeg', true)).toBe('/usr/local/bin/ffmpeg')
  })
})
