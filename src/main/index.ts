import { app, BrowserWindow, nativeImage } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createMainWindow } from './window'
import { registerAuthHandlers } from './ipc/auth'
import { registerAwsCredentialHandlers } from './ipc/aws-creds'
import { registerBrowserContextMenuHandlers } from './ipc/browser-context-menu'
import { registerBrowserDetectHandlers } from './ipc/browser-detect'
import { registerBrowserDownloadHandlers } from './ipc/browser-download'
import { registerChatHandlers } from './ipc/chat'
import { registerDialogHandlers } from './ipc/dialog'
import { registerSettingsHandlers } from './ipc/settings'
import { registerShellHandlers } from './ipc/shell'
import { devUserDataPath, ensureDevUserData } from './userdata-seed'

// TD-063: unpackaged runs live in `<userData>-dev` so `npm run dev`
// can't retarget the installed app's `apiUrl` (both resolve `userData`
// to the same directory otherwise — see `userdata-seed.ts`). Runs
// before `whenReady` because the session/cache paths are derived from
// `userData` at startup. `-prod` deliberately does not move the run
// back onto the shared directory: it selects a backend, not a profile.
//
// A failure here is logged rather than fatal — the app still launches,
// just on the shared directory as it did before.
if (!app.isPackaged) {
  try {
    const sharedUserData = app.getPath('userData')
    const devUserData = devUserDataPath(sharedUserData)
    ensureDevUserData(sharedUserData, devUserData)
    app.setPath('userData', devUserData)
  } catch (error) {
    console.warn('[userdata] dev profile redirect failed; using the shared directory', error)
  }
}

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
  registerAwsCredentialHandlers()
  registerChatHandlers()
  registerShellHandlers()
  registerDialogHandlers()
  registerBrowserDetectHandlers()
  const browserDownload = registerBrowserDownloadHandlers()
  registerBrowserContextMenuHandlers(browserDownload)
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
