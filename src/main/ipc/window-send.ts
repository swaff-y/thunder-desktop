/**
 * One-way main → renderer pushes.
 *
 * Mirrors halo-desktop's updater fan-out: prefer the focused window,
 * but fall back to the first available so events still land if the user
 * clicked away — onto a video player mid-download, or off Home while a
 * chat turn is still running.
 */

import { BrowserWindow } from 'electron'

export function sendToFocused(channel: string, payload: unknown): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
  if (target && !target.isDestroyed() && !target.webContents.isDestroyed()) {
    target.webContents.send(channel, payload)
  }
}
