/**
 * TD-047: unit tests for the data:/blob: image source helpers — MIME →
 * extension mapping and data: URL decoding.
 */

import { describe, expect, it } from 'vitest'
import {
  decodeImageDataUrl,
  imageFilenameFromMime,
  imageMimeToExtension
} from '../browser-image-source'

describe('imageMimeToExtension (TD-047)', () => {
  it('maps known image MIME types to curated extensions', () => {
    expect(imageMimeToExtension('image/jpeg')).toBe('jpg')
    expect(imageMimeToExtension('image/png')).toBe('png')
    expect(imageMimeToExtension('image/gif')).toBe('gif')
    expect(imageMimeToExtension('image/webp')).toBe('webp')
    expect(imageMimeToExtension('image/svg+xml')).toBe('svg')
    expect(imageMimeToExtension('image/vnd.microsoft.icon')).toBe('ico')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(imageMimeToExtension('  IMAGE/PNG  ')).toBe('png')
  })

  it('derives the extension from the subtype for unknown image types', () => {
    expect(imageMimeToExtension('image/heic')).toBe('heic')
    expect(imageMimeToExtension('image/x-canon-cr2')).toBe('canon-cr2')
  })

  it('falls back to jpg for non-image or unusable MIME types', () => {
    expect(imageMimeToExtension('application/octet-stream')).toBe('jpg')
    expect(imageMimeToExtension('image/')).toBe('jpg')
  })

  it('builds image.<ext> filenames', () => {
    expect(imageFilenameFromMime('image/gif')).toBe('image.gif')
    expect(imageFilenameFromMime('image/jpeg')).toBe('image.jpg')
  })
})

describe('decodeImageDataUrl (TD-047)', () => {
  it('decodes a base64 image payload to the original bytes', () => {
    const original = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
    const url = `data:image/jpeg;base64,${original.toString('base64')}`
    const decoded = decodeImageDataUrl(url)
    expect(decoded).not.toBeNull()
    expect(decoded?.mime).toBe('image/jpeg')
    expect(decoded?.bytes.equals(original)).toBe(true)
  })

  it('decodes a percent-encoded (non-base64) SVG payload as UTF-8', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
    const decoded = decodeImageDataUrl(url)
    expect(decoded?.mime).toBe('image/svg+xml')
    expect(decoded?.bytes.toString('utf8')).toBe(svg)
  })

  it('returns null for a non-image MIME type (fail closed)', () => {
    expect(decodeImageDataUrl('data:text/plain;base64,aGVsbG8=')).toBeNull()
  })

  it('returns null for a malformed data URL (no comma)', () => {
    expect(decodeImageDataUrl('data:image/png;base64')).toBeNull()
  })

  it('returns null for an empty payload', () => {
    expect(decodeImageDataUrl('data:image/png;base64,')).toBeNull()
  })

  it('returns null for a non-data: URL', () => {
    expect(decodeImageDataUrl('https://cdn.example.com/a.png')).toBeNull()
    expect(decodeImageDataUrl('blob:https://example.com/abc')).toBeNull()
  })
})
