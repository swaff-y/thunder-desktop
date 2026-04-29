import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'

const REPO_URL = 'https://github.com/swaff-y/thunder-desktop'

/**
 * Subset of `BrowserWindow` that {@link buildMenuTemplate} actually
 * consumes. Keeping it narrow lets tests pass a stub instead of
 * faking the full `WebContents` surface.
 */
export interface MenuWindow {
  webContents: {
    toggleDevTools: () => void
  }
}

/**
 * Dependencies that have to come from outside the menu module — chiefly
 * `createWindow` for File → New Window, which would otherwise create a
 * circular import with `window.ts`.
 */
export interface BuildMenuDeps {
  createWindow: () => BrowserWindow
}

export function buildMenu(window: BrowserWindow, deps: BuildMenuDeps): Menu {
  return Menu.buildFromTemplate(buildMenuTemplate(window, deps))
}

export function buildMenuTemplate(
  window: MenuWindow,
  deps: BuildMenuDeps
): MenuItemConstructorOptions[] {
  const isMac = process.platform === 'darwin'

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', accelerator: 'CmdOrCtrl+Q' }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          deps.createWindow()
        }
      },
      { type: 'separator' },
      { role: 'close', accelerator: 'CmdOrCtrl+W' }
    ]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      // AC: DevTools toggle works in both dev and prod builds — unlike
      // halo-desktop, which gates this behind `is.dev`.
      {
        label: 'Toggle Developer Tools',
        accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: () => window.webContents.toggleDevTools()
      },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(isMac
        ? ([
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' }
          ] satisfies MenuItemConstructorOptions[])
        : ([{ role: 'close' }] satisfies MenuItemConstructorOptions[]))
    ]
  }

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      {
        label: 'Thunder Desktop on GitHub',
        click: () => {
          void shell.openExternal(REPO_URL)
        }
      }
    ]
  }

  return isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
}
