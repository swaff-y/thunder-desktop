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
import {
  THUNDER_IPC_CHANNELS,
  type ThunderOpenDirectoryResult
} from '../../preload/thunder-api'

async function isDirectoryWritable(dirPath: string): Promise<boolean> {
  // `fs.access(.., W_OK)` is unreliable on macOS for ACL-protected
  // paths (`/System`, `/Library`) — the bit can read writable while
  // an actual write fails. Probe with an actual create+unlink so we
  // reject those folders honestly.
  const probe = join(dirPath, `.thunder-write-probe-${randomBytes(6).toString('hex')}`)
  let written = false
  try {
    await fs.writeFile(probe, '')
    written = true
    return true
  } catch {
    return false
  } finally {
    // Unconditional cleanup: if `writeFile` succeeded but a later
    // step (or this function's caller) throws, we must still remove
    // the probe file so it doesn't litter the user's folder.
    if (written) {
      await fs.unlink(probe).catch(() => {
        /* probe file already gone or permission flipped — nothing to do */
      })
    }
  }
}

export function registerDialogHandlers(): void {
  ipcMain.handle(
    THUNDER_IPC_CHANNELS.dialogOpenDirectory,
    async (event): Promise<ThunderOpenDirectoryResult> => {
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
