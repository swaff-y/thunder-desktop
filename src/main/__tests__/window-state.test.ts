import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_STATE,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  clampToVisibleDisplay,
  coerceWindowState,
  readWindowStateFile,
  writeWindowStateFile,
  type DisplayBounds,
  type WindowState
} from '../window-state'

describe('window-state (TD-003)', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'thunder-window-'))
    path = join(dir, 'thunder-desktop-window-state.json')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  // ─── Defaults / fallback ──────────────────────────────────────────

  it('returns DEFAULT_WINDOW_STATE when no file exists', () => {
    expect(readWindowStateFile(path)).toEqual(DEFAULT_WINDOW_STATE)
  })

  it('returns DEFAULT_WINDOW_STATE on a corrupted file rather than throwing', () => {
    writeFileSync(path, '{ this is not json !!')
    expect(readWindowStateFile(path)).toEqual(DEFAULT_WINDOW_STATE)
  })

  it('uses the plan-recommended starting frame as the default (1280×800, not maximized)', () => {
    expect(DEFAULT_WINDOW_STATE).toEqual({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      maximized: false
    })
  })

  // ─── Round-trip ───────────────────────────────────────────────────

  it('round-trips a fully-populated state via write → read', () => {
    const state: WindowState = {
      x: 240,
      y: 120,
      width: 1440,
      height: 900,
      maximized: false
    }
    writeWindowStateFile(path, state)
    expect(readWindowStateFile(path)).toEqual(state)
  })

  it('round-trips a maximized record (bounds preserved alongside the maximized flag)', () => {
    const state: WindowState = {
      x: 50,
      y: 50,
      width: 1600,
      height: 1000,
      maximized: true
    }
    writeWindowStateFile(path, state)
    expect(readWindowStateFile(path)).toEqual(state)
  })

  it('omits x / y from the read result when they were not stored', () => {
    writeFileSync(path, JSON.stringify({ width: 1280, height: 800, maximized: false }))
    const state = readWindowStateFile(path)
    expect(state.x).toBeUndefined()
    expect(state.y).toBeUndefined()
    expect(state.width).toBe(1280)
  })

  // ─── Coercion ─────────────────────────────────────────────────────

  it('clamps a too-small width up to MIN_WINDOW_WIDTH', () => {
    expect(coerceWindowState({ width: 100, height: 800 }).width).toBe(MIN_WINDOW_WIDTH)
  })

  it('clamps a too-small height up to MIN_WINDOW_HEIGHT', () => {
    expect(coerceWindowState({ width: 1280, height: 100 }).height).toBe(MIN_WINDOW_HEIGHT)
  })

  it('clamps an absurdly-large dimension down to a sane upper bound', () => {
    const state = coerceWindowState({ width: 99_999_999, height: 99_999_999 })
    expect(state.width).toBeLessThan(99_999_999)
    expect(state.height).toBeLessThan(99_999_999)
  })

  it('falls back to defaults for non-numeric width / height', () => {
    const state = coerceWindowState({
      width: 'wide' as unknown as number,
      height: NaN
    })
    expect(state.width).toBe(DEFAULT_WINDOW_WIDTH)
    expect(state.height).toBe(DEFAULT_WINDOW_HEIGHT)
  })

  it('coerces a non-boolean maximized to false (only literal true counts)', () => {
    expect(coerceWindowState({ maximized: 'yes' as unknown as boolean }).maximized).toBe(false)
    expect(coerceWindowState({ maximized: 1 as unknown as boolean }).maximized).toBe(false)
    expect(coerceWindowState({ maximized: true }).maximized).toBe(true)
  })

  it('drops invalid x / y but keeps the rest of the state', () => {
    const state = coerceWindowState({
      x: NaN,
      y: 'left' as unknown as number,
      width: 1280,
      height: 800
    })
    expect(state.x).toBeUndefined()
    expect(state.y).toBeUndefined()
    expect(state.width).toBe(1280)
  })

  it('accepts negative coordinates (multi-monitor: display left of primary)', () => {
    const state = coerceWindowState({
      x: -200,
      y: -100,
      width: 1280,
      height: 800
    })
    expect(state.x).toBe(-200)
    expect(state.y).toBe(-100)
  })

  it('rounds fractional dimensions to integers (Electron expects ints)', () => {
    const state = coerceWindowState({
      x: 100.7,
      y: 50.3,
      width: 1280.9,
      height: 800.4
    })
    expect(state.x).toBe(101)
    expect(state.y).toBe(50)
    expect(state.width).toBe(1281)
    expect(state.height).toBe(800)
  })

  // ─── Persistence shape ────────────────────────────────────────────

  it('writes a JSON file that contains exactly the persisted keys', () => {
    writeWindowStateFile(path, {
      x: 100,
      y: 100,
      width: 1280,
      height: 800,
      maximized: false
    })
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    expect(raw).toEqual({ x: 100, y: 100, width: 1280, height: 800, maximized: false })
  })

  it('normalises out-of-range values BEFORE writing (no garbage on disk)', () => {
    writeWindowStateFile(path, {
      width: 50, // below MIN_WINDOW_WIDTH
      height: 50, // below MIN_WINDOW_HEIGHT
      maximized: false
    })
    const raw = JSON.parse(readFileSync(path, 'utf-8'))
    expect(raw.width).toBe(MIN_WINDOW_WIDTH)
    expect(raw.height).toBe(MIN_WINDOW_HEIGHT)
  })
})

describe('clampToVisibleDisplay (TD-003)', () => {
  // Standard 2560×1440 primary display at the origin. Enough to hold
  // a 1280×800 window at any reasonable x/y.
  const PRIMARY: DisplayBounds = { x: 0, y: 0, width: 2560, height: 1440 }
  // A secondary monitor placed to the left of the primary (negative
  // origin), simulating a common dual-monitor setup.
  const SECONDARY_LEFT: DisplayBounds = { x: -1920, y: 0, width: 1920, height: 1080 }

  function stateAt(x: number | undefined, y: number | undefined): WindowState {
    return { x, y, width: 1280, height: 800, maximized: false }
  }

  it('passes state through unchanged when x/y are undefined (nothing to validate)', () => {
    const state = stateAt(undefined, undefined)
    expect(clampToVisibleDisplay(state, [PRIMARY])).toEqual(state)
  })

  it('passes state through unchanged when the frame is fully inside a display', () => {
    const state = stateAt(100, 100)
    expect(clampToVisibleDisplay(state, [PRIMARY])).toEqual(state)
  })

  it('passes state through unchanged when the frame straddles two connected displays', () => {
    // Window sitting across the seam between the left secondary and
    // the primary — at x=-200 the window extends from x=-200 to
    // x=1080, overlapping both displays. Should be preserved.
    const state = stateAt(-200, 100)
    expect(clampToVisibleDisplay(state, [PRIMARY, SECONDARY_LEFT])).toEqual(state)
  })

  it('drops x/y when the saved position is fully off-screen (monitor disconnect)', () => {
    // The user moved the window to a now-disconnected secondary
    // monitor at x=-1920. Without that display in the list, the
    // frame no longer overlaps anything visible.
    const state = stateAt(-1800, 100)
    const clamped = clampToVisibleDisplay(state, [PRIMARY])
    expect(clamped.x).toBeUndefined()
    expect(clamped.y).toBeUndefined()
    // Width, height, and maximized state survive — only the position
    // is stale. Restoring the size is still the right call.
    expect(clamped.width).toBe(1280)
    expect(clamped.height).toBe(800)
    expect(clamped.maximized).toBe(false)
  })

  it('drops x/y when the saved position is fully below a display (vertical off-screen)', () => {
    // Window saved at y=2000, but the only display is 1440 tall —
    // the frame's top edge is already past the bottom of the display.
    // Nothing visible → drop position.
    const state = stateAt(100, 2000)
    const clamped = clampToVisibleDisplay(state, [PRIMARY])
    expect(clamped.x).toBeUndefined()
    expect(clamped.y).toBeUndefined()
  })

  it('preserves the maximized flag even when clamping drops x/y', () => {
    const state: WindowState = { x: -5000, y: -5000, width: 1280, height: 800, maximized: true }
    const clamped = clampToVisibleDisplay(state, [PRIMARY])
    expect(clamped.x).toBeUndefined()
    expect(clamped.maximized).toBe(true)
  })

  it('passes state through unchanged when the display list is empty (defensive)', () => {
    // Shouldn't happen in practice (Electron always reports at least
    // the primary), but a belt-and-braces check so the function
    // stays total.
    const state = stateAt(100, 100)
    expect(clampToVisibleDisplay(state, [])).toEqual(state)
  })

  it('recognises a window with just one visible pixel as still on-screen', () => {
    // Window's right edge at exactly x=1 — the leftmost pixel is
    // still inside the display, so it's considered visible.
    const state = stateAt(-1279, 100)
    expect(clampToVisibleDisplay(state, [PRIMARY])).toEqual(state)
  })

  it('treats a window one pixel beyond the left edge as off-screen', () => {
    // Window's right edge at exactly x=0 — zero pixels are inside
    // the display. Strict overlap check: drop position.
    const state = stateAt(-1280, 100)
    const clamped = clampToVisibleDisplay(state, [PRIMARY])
    expect(clamped.x).toBeUndefined()
  })
})
