/**
 * TD-024: pure path-resolution helper for the browser download manager.
 * Kept free of `electron` so it stays unit-testable under vitest's node
 * environment (mirrors the auth-io / settings-io / browser-detect-rules
 * split in this folder).
 */

import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * Returns a path inside `folder` that does not yet exist, suffixing
 * the basename with ` (n)` when needed: `intro.mp4` → `intro (2).mp4`
 * → `intro (3).mp4` → … . The extension is preserved (`extname`'s
 * trailing-segment definition, so `archive.tar.gz` collides on `.gz`,
 * which matches the OS Finder/Explorer rename behaviour).
 *
 * `exists` is injected so tests can drive the loop without touching
 * the filesystem; production callers leave the default.
 */
export function resolveCollisionSafePath(
  folder: string,
  filename: string,
  exists: (path: string) => boolean = existsSync
): string {
  const target = join(folder, filename)
  if (!exists(target)) return target

  const ext = extname(filename)
  const base = ext.length > 0 ? filename.slice(0, -ext.length) : filename

  // Start at (2) to match Finder: original is the implicit (1).
  for (let n = 2; ; n++) {
    const candidate = join(folder, `${base} (${n})${ext}`)
    if (!exists(candidate)) return candidate
  }
}
