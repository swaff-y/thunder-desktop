/**
 * TD-003: persists the main window's size, position, and maximized
 * state between launches so users don't have to re-arrange the app
 * every time they open it. Stored as a tiny JSON file under
 * `app.getPath('userData')` so we don't pull in a new dependency just
 * for four numbers and a boolean.
 *
 * The pure I/O surface lives here (no `electron` import). The
 * Electron-aware glue — actually wiring this to a `BrowserWindow`,
 * debouncing resize/move, restoring on launch — lives in `window.ts`
 * so this module stays unit-testable under vitest's node environment.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * Plan §1 starting size. Wide enough for the records detail layout,
 * tall enough for a reasonable gallery + metadata strip without
 * scrolling.
 */
export const DEFAULT_WINDOW_WIDTH = 1280
export const DEFAULT_WINDOW_HEIGHT = 800

/**
 * Lower bounds enforced both as `BrowserWindow` constructor options
 * and as a coercion floor when reading a persisted state. The latter
 * matters because a corrupted file with `width: 100` would otherwise
 * yield an unusably-narrow window — even though Electron would
 * eventually clamp it to `minWidth`, we'd rather never write or load
 * an out-of-range value in the first place.
 */
export const MIN_WINDOW_WIDTH = 960
export const MIN_WINDOW_HEIGHT = 640

/**
 * Upper bound — paranoia against a corrupt file with `width:
 * 999_999` that would create a window the OS refuses to display. No
 * real display is wider than this and Electron will clamp anyway,
 * but coercing here keeps the persisted JSON sane.
 */
const MAX_REASONABLE_DIMENSION = 16_384

export interface WindowState {
  /** Top-left x. `undefined` means "let the OS pick (centered)". */
  x?: number
  /** Top-left y. `undefined` means "let the OS pick (centered)". */
  y?: number
  width: number
  height: number
  maximized: boolean
}

/**
 * Minimal `Display.bounds`-shaped record. Kept separate from
 * Electron's `Rectangle` so this module stays free of the `electron`
 * import and testable under vitest's node environment.
 */
export interface DisplayBounds {
  x: number
  y: number
  width: number
  height: number
}

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
  maximized: false
}

function coerceDimension(value: unknown, min: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  if (num < min) return min
  if (num > MAX_REASONABLE_DIMENSION) return MAX_REASONABLE_DIMENSION
  return Math.round(num)
}

function coerceCoordinate(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return undefined
  // Negative coordinates are valid (multi-monitor setups can place a
  // display to the left of / above the primary), but coerce
  // absurdly-large values that almost certainly indicate corruption.
  if (Math.abs(num) > MAX_REASONABLE_DIMENSION) return undefined
  return Math.round(num)
}

/**
 * Coerces a potentially-malformed `Partial<WindowState>` into a
 * fully validated `WindowState`. Out-of-range numbers are clamped to
 * the min/max bounds; missing or unparseable values fall back to the
 * defaults. Extracted so `writeWindowStateFile` can normalise before
 * writing and so unit tests can hit the coercion path directly.
 */
export function coerceWindowState(partial: Partial<WindowState>): WindowState {
  return {
    x: coerceCoordinate(partial.x),
    y: coerceCoordinate(partial.y),
    width: coerceDimension(partial.width, MIN_WINDOW_WIDTH, DEFAULT_WINDOW_WIDTH),
    height: coerceDimension(partial.height, MIN_WINDOW_HEIGHT, DEFAULT_WINDOW_HEIGHT),
    maximized: partial.maximized === true
  }
}

/**
 * Reads persisted window state from disk. Returns `DEFAULT_WINDOW_STATE`
 * if the file is missing, unparseable, or contains nothing usable —
 * the caller always gets a fully-populated `WindowState` back, even
 * on a corrupt disk, so the BrowserWindow constructor never sees
 * `width: undefined`.
 */
export function readWindowStateFile(path: string): WindowState {
  try {
    if (!existsSync(path)) return DEFAULT_WINDOW_STATE
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    return coerceWindowState(parsed)
  } catch (error) {
    console.error(`[window-state] failed to read ${path}`, error)
    return DEFAULT_WINDOW_STATE
  }
}

export function writeWindowStateFile(path: string, state: WindowState): void {
  try {
    writeFileSync(path, JSON.stringify(coerceWindowState(state)), 'utf-8')
  } catch (error) {
    console.error(`[window-state] failed to write ${path}`, error)
  }
}

/**
 * Guards against "monitor disconnected between sessions" — a user who
 * moved the app to a secondary display, then unplugged that display
 * before the next launch, would otherwise restore the window to
 * coordinates that no longer reference any visible pixel. Electron
 * does NOT auto-center in that case when explicit `x`/`y` are passed
 * to the constructor.
 *
 * Returns the state unchanged when the stored frame still overlaps
 * at least one connected display. Otherwise, drops `x`/`y` so the
 * next `new BrowserWindow({...})` call omits them and Electron
 * centers on the primary display. Width, height, and the `maximized`
 * flag are always preserved — restoring the size is still the right
 * call even if the position is stale.
 *
 * "Overlap" is a strict-intersection check: at least one pixel of
 * the stored frame must fall inside a display's bounds. That's
 * forgiving enough for minor resolution changes (dock height tweaks,
 * scale factor shifts) and strict enough to catch the
 * fully-off-screen case a disconnected monitor produces.
 */
export function clampToVisibleDisplay(
  state: WindowState,
  displays: ReadonlyArray<DisplayBounds>
): WindowState {
  // Nothing to validate — Electron will center the window.
  if (state.x === undefined || state.y === undefined) return state
  // Defensive: if the caller couldn't enumerate displays (shouldn't
  // happen in practice, but keeps the function total), pass through
  // rather than throwing away the saved position.
  if (displays.length === 0) return state

  const frame: DisplayBounds = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height
  }
  const visible = displays.some((d) => rectanglesOverlap(frame, d))
  if (visible) return state

  return { ...state, x: undefined, y: undefined }
}

function rectanglesOverlap(a: DisplayBounds, b: DisplayBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
