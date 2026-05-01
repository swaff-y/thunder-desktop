import { app, BrowserWindow, nativeImage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createMainWindow } from './window'
import { registerAuthHandlers } from './ipc/auth'
import { registerBrowserDetectHandlers } from './ipc/browser-detect'
import { registerBrowserDownloadHandlers } from './ipc/browser-download'
import { registerDialogHandlers } from './ipc/dialog'
import { registerSettingsHandlers } from './ipc/settings'
import { registerShellHandlers } from './ipc/shell'

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ruby-sei.thunder-desktop')

  // Packaged macOS builds read the dock icon from the bundled .icns
  // (see `electron-builder.yml`). Unpackaged dev runs (`npm run dev`)
  // would otherwise show the generic Electron icon — override here so
  // the dev experience matches the production build.
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerSettingsHandlers()
  registerAuthHandlers()
  registerShellHandlers()
  registerDialogHandlers()
  registerBrowserDetectHandlers()
  registerBrowserDownloadHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
