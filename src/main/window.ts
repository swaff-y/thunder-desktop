import { app, BrowserWindow, Menu, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { buildMenu } from './menu'
import {
  clampToVisibleDisplay,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  readWindowStateFile,
  writeWindowStateFile,
  type WindowState
} from './window-state'

const WINDOW_STATE_FILENAME = 'thunder-desktop-window-state.json'
// Debounce resize/move writes so a drag doesn't burn one disk write
// per pixel of movement. 500ms is short enough that a hard quit
// moments after a resize still persists, long enough that a normal
// drag collapses to a single write at the end.
const WRITE_DEBOUNCE_MS = 500

function getWindowStatePath(): string {
  return join(app.getPath('userData'), WINDOW_STATE_FILENAME)
}

/**
 * Wires resize / move / maximize / unmaximize / close listeners to
 * persist the window's bounds. Resize and move are debounced so a
 * single drag collapses to one disk write at the end. Maximize state
 * is captured separately because Electron returns the *restored*
 * bounds from `getNormalBounds()` while a window is maximized — saving
 * those bounds is exactly what we want, since the next launch
 * un-maximizes back to that frame after the maximize step.
 */
function trackWindowState(win: BrowserWindow): void {
  const path = getWindowStatePath()
  let writeTimer: NodeJS.Timeout | null = null

  const captureState = (): WindowState => {
    const bounds = win.getNormalBounds()
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized()
    }
  }

  const flush = (): void => {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    if (win.isDestroyed()) return
    writeWindowStateFile(path, captureState())
  }

  const scheduleWrite = (): void => {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(flush, WRITE_DEBOUNCE_MS)
  }

  win.on('resize', scheduleWrite)
  win.on('move', scheduleWrite)
  // Maximize / unmaximize are discrete state transitions, not
  // continuous drags — write immediately so a quit right after
  // maximizing persists the new mode.
  win.on('maximize', flush)
  win.on('unmaximize', flush)
  // `close` is the last chance to capture state before the renderer
  // tears down. Synchronous flush — debounced writes that haven't
  // landed yet would otherwise lose the final size.
  win.on('close', flush)
}

export function createMainWindow(): BrowserWindow {
  // Restore size + position from the previous session if any,
  // otherwise the plan's recommended starting frame (1280×800,
  // OS-centered). If the previous session's position references a
  // display that's since been disconnected, `clampToVisibleDisplay`
  // drops x/y so Electron re-centers on the primary display rather
  // than opening the window off-screen.
  const rawState = readWindowStateFile(getWindowStatePath())
  const persisted = clampToVisibleDisplay(
    rawState,
    screen.getAllDisplays().map((d) => d.bounds)
  )

  const win = new BrowserWindow({
    x: persisted.x,
    y: persisted.y,
    width: persisted.width,
    height: persisted.height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // `Menu.setApplicationMenu` is process-global. On macOS the system
  // owns a single app-wide menu bar so re-invoking per window is the
  // intended pattern — each window gets a menu whose click handlers
  // close over its own webContents. On Windows/Linux this means the
  // last window opened replaces the menu for every existing window;
  // for v1 (macOS-first) this is fine.
  Menu.setApplicationMenu(buildMenu(win, { createWindow: createMainWindow }))

  trackWindowState(win)

  win.on('ready-to-show', () => {
    // Re-apply maximized state after the window has actually been
    // shown — calling `maximize()` before `ready-to-show` flickers a
    // small frame on macOS.
    if (persisted.maximized) win.maximize()
    win.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
