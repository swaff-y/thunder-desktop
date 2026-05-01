/**
 * TD-026: renderer → main bridge for the native folder picker and
 * `shell.showItemInFolder`. Settings' "Choose…" button asks main to
 * open the OS directory picker; the downloads surface (TD-025) uses
 * `showItemInFolder` to reveal a completed download in Finder.
 *
 * Writability probe: a non-writable target (e.g., `/System`) silently
 * accepted at picker close would surface much later as a download
 * failure with no breadcrumb back to the setting. We probe with a
 * tempfile here so the modal can refuse the selection up front.
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { THUNDER_IPC_CHANNELS } from '../../preload/thunder-api'

export interface OpenDirectoryResult {
  canceled: boolean
  path?: string
  error?: 'not-writable'
}

async function isDirectoryWritable(dirPath: string): Promise<boolean> {
  // `fs.access(.., W_OK)` is unreliable on macOS for ACL-protected
  // paths (`/System`, `/Library`) — the bit can read writable while
  // an actual write fails. Probe with an actual create+unlink so we
  // reject those folders honestly.
  const probe = join(dirPath, `.thunder-write-probe-${randomBytes(6).toString('hex')}`)
  try {
    await fs.writeFile(probe, '')
    await fs.unlink(probe)
    return true
  } catch {
    return false
  }
}

export function registerDialogHandlers(): void {
  ipcMain.handle(
    THUNDER_IPC_CHANNELS.dialogOpenDirectory,
    async (event): Promise<OpenDirectoryResult> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const result = window
        ? await dialog.showOpenDialog(window, {
            properties: ['openDirectory', 'createDirectory']
          })
        : await dialog.showOpenDialog({
            properties: ['openDirectory', 'createDirectory']
          })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }
      const path = result.filePaths[0]
      if (!(await isDirectoryWritable(path))) {
        return { canceled: false, error: 'not-writable' }
      }
      return { canceled: false, path }
    }
  )

  ipcMain.handle(
    THUNDER_IPC_CHANNELS.dialogShowItemInFolder,
    async (_event, args: unknown): Promise<void> => {
      if (!args || typeof args !== 'object') {
        throw new Error('[dialog] show-item-in-folder requires { path }')
      }
      const { path } = args as { path?: unknown }
      if (typeof path !== 'string' || path.length === 0) {
        throw new Error('[dialog] path must be a non-empty string')
      }
      shell.showItemInFolder(path)
    }
  )
}
