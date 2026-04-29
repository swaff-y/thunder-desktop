# TD-002 — Native application menu

## Description

Install a native application menu in the main process so the app behaves like a normal macOS desktop app: standard cut/copy/paste, reload, DevTools, zoom, window controls, and an About entry. Lift the structure from `halo-desktop/src/main/menu.ts` and trim halo-specific items.

## Requirements

- Add `src/main/menu.ts` exporting `buildMenu(win: BrowserWindow): Menu`.
- Menu structure:
  - **App** (macOS only) — About, Hide, Hide Others, Show All, Quit.
  - **File** — New Window (re-uses `createMainWindow`), Close Window.
  - **Edit** — Undo, Redo, Cut, Copy, Paste, Select All (use Electron `role` defaults).
  - **View** — Reload, Force Reload, Toggle DevTools, Reset Zoom, Zoom In, Zoom Out, Toggle Full Screen.
  - **Window** — Minimize, Zoom, Front (macOS).
  - **Help** — Open thunder-desktop GitHub repo via `shell.openExternal`.
- `Menu.setApplicationMenu(buildMenu(win))` called from `createMainWindow` after the window is constructed.
- Menu items dispatch to the focused window's renderer via `webContents.send('thunder:menu:action', ...)` for any custom (non-role) actions. v1 has none yet — ship the channel scaffold so future tickets can hook in.

## ACs

- macOS menu bar shows: Thunder Desktop, File, Edit, View, Window, Help.
- All standard `role`-based items work (cut/copy/paste in any input field, reload, zoom, fullscreen).
- "New Window" opens a second main window.
- "Help → Thunder Desktop on GitHub" opens the repo URL in the default browser.
- Cmd+Q quits, Cmd+W closes the focused window, Cmd+M minimizes.
- DevTools toggle works in both dev and prod builds.

## Test plan

1. `npm run dev` and verify every menu item is present and clickable.
2. Click "New Window" → confirm a second window opens.
3. Click "Help → GitHub" → confirm default browser opens to the repo URL.
4. In a renderer text input, test Cmd+C / Cmd+V via the menu (not just the keyboard).
5. Build with `npm run build:mac` and confirm the menu is identical in the packaged app.
