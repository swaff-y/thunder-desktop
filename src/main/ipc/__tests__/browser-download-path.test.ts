import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveCollisionSafePath } from '../browser-download-path'

describe('resolveCollisionSafePath (TD-024)', () => {
  it('returns the target path unchanged when it does not exist', () => {
    const exists = (): boolean => false
    expect(resolveCollisionSafePath('/dl', 'intro.mp4', exists)).toBe('/dl/intro.mp4')
  })

  it('appends " (2)" before the extension on first collision', () => {
    const taken = new Set(['/dl/intro.mp4'])
    const result = resolveCollisionSafePath('/dl', 'intro.mp4', (p) => taken.has(p))
    expect(result).toBe('/dl/intro (2).mp4')
  })

  it('walks the suffix counter past consecutive collisions', () => {
    const taken = new Set(['/dl/intro.mp4', '/dl/intro (2).mp4', '/dl/intro (3).mp4'])
    const result = resolveCollisionSafePath('/dl', 'intro.mp4', (p) => taken.has(p))
    expect(result).toBe('/dl/intro (4).mp4')
  })

  it('handles filenames with no extension', () => {
    const taken = new Set(['/dl/README'])
    const result = resolveCollisionSafePath('/dl', 'README', (p) => taken.has(p))
    expect(result).toBe('/dl/README (2)')
  })

  it('treats the trailing segment as the extension (matches Finder rename behaviour)', () => {
    // extname('archive.tar.gz') is '.gz', so " (2)" lands before .gz —
    // not before .tar. This is intentional and consistent with the OS.
    const taken = new Set(['/dl/archive.tar.gz'])
    const result = resolveCollisionSafePath('/dl', 'archive.tar.gz', (p) => taken.has(p))
    expect(result).toBe('/dl/archive.tar (2).gz')
  })

  it('integrates with the real filesystem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'thunder-dl-collision-'))
    try {
      writeFileSync(join(dir, 'clip.mp4'), '')
      writeFileSync(join(dir, 'clip (2).mp4'), '')
      expect(resolveCollisionSafePath(dir, 'clip.mp4')).toBe(join(dir, 'clip (3).mp4'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  describe('first-write hygiene', () => {
    let dir: string
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'thunder-dl-collision2-'))
    })
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true })
    })

    it('returns the original name when the directory is empty', () => {
      expect(resolveCollisionSafePath(dir, 'fresh.mp4')).toBe(join(dir, 'fresh.mp4'))
    })
  })
})
