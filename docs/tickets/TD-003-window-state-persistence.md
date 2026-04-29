# TD-003 — Persist window state across launches

## Description

Persist the main window's size, position, and maximized state across app restarts. If the user resizes / moves / maximizes the window, those bounds restore on next launch. If the previously-saved position references a display that is no longer attached, fall back to OS-default centering on the primary display.

Lifts the halo-desktop pattern: `src/main/window-state.ts` plus debounced writes wired up in `window.ts`.

## Requirements

- Add `src/main/window-state.ts` exporting:
  - `WindowState` type (`x`, `y`, `width`, `height`, `maximized`).
  - `readWindowStateFile(path): WindowState | null`.
  - `writeWindowStateFile(path, state): void`.
  - `clampToVisibleDisplay(state, displayBounds): Partial<WindowState>` — drops `x`/`y` if the saved frame is not within any current display.
  - `MIN_WINDOW_WIDTH`, `MIN_WINDOW_HEIGHT` constants (e.g. 960×640).
- State file lives at `path.join(app.getPath('userData'), 'thunder-desktop-window-state.json')`.
- In `createMainWindow`:
  - On startup, read state, clamp to visible displays, apply to `BrowserWindow` constructor.
  - Wire `resize` and `move` listeners with a 500ms debounce that writes the new bounds.
  - `maximize` and `unmaximize` flush immediately.
  - `close` flushes synchronously to capture final state.
- Default first-launch frame: 1280×800, OS-centered.

## ACs

- Resize the window to a new size, quit, relaunch — window opens at the new size.
- Move the window to a new position, quit, relaunch — window opens at the new position.
- Maximize the window, quit, relaunch — window opens maximized.
- Drag the window to a second display, quit, disconnect that display, relaunch — window opens centered on primary display (not off-screen).
- Window cannot be resized below 960×640.
- A drag-resize that lasts a few seconds produces ~one disk write at the end (verified by `fs.watchFile` or instrumentation).

## Test plan

1. Launch app, drag to resize, quit, relaunch — verify size restored.
2. Repeat for position.
3. Maximize, quit, relaunch — verify maximized.
4. With an external display attached, drag to it, quit, unplug display, relaunch — verify window appears on primary display.
5. Try to resize below the minimum — verify the floor is enforced.
6. Inspect `~/Library/Application Support/Thunder Desktop/thunder-desktop-window-state.json` after each step and confirm contents update.
7. Unit-test `clampToVisibleDisplay` with synthetic display bounds.
