import { BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { buildMenu } from './menu'

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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

  win.on('ready-to-show', () => {
    win.show()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
