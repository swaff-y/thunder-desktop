# TD-021 — Browser tab — embedded webview with chrome

## Description

Build the embedded browser UI: address bar, back/forward/reload, and a `<webview>` rendering arbitrary HTTPS pages. No detection / download yet (those land in TD-022 through TD-025).

## Requirements

- Replace the placeholder `Browser.tsx` from TD-020 with the real layout:
  - `src/renderer/src/browser/BrowserPage.tsx` — root.
  - `src/renderer/src/browser/BrowserChrome.tsx` — back, forward, reload, address bar, Go button.
  - `src/renderer/src/browser/EmbeddedWebview.tsx` — wraps the `<webview>` tag.
  - `src/renderer/src/browser/useBrowserNav.ts` — manages url/history/loading state, exposes `goBack`, `goForward`, `reload`, `loadURL`.
- Enable `<webview>` in `BrowserWindow` `webPreferences`: `webviewTag: true`.
- Webview attributes:
  - `partition="persist:thunder-browser"` (isolated cookie jar).
  - `webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no"`.
  - `useragent` from `window.thunder.settings.get('userAgent')` (falls back to a current-Chrome desktop UA).
  - `allowpopups="false"` (popups are caught and routed back to the same webview via `new-window` event handler).
- URL validation on Go: prepend `https://` if missing scheme; reject non-`http`/`https` schemes.
- Loading indicator in the chrome bar when webview is loading.
- Failed-load state shows error UI ("Page failed to load: <reason>") with a retry button.
- New-window events open in the same webview rather than a popup. `mailto:`/`tel:`/extension schemes route to `shell.openExternal` after allowlist check (lift `openExternalIfAllowed` from halo-desktop's `window.ts`).

## ACs

- Navigating to `https://example.com` loads the page inside the webview.
- Back / Forward / Reload buttons work after multi-step navigation.
- Typing a hostname without scheme (e.g. `example.com`) navigates to `https://example.com`.
- Typing a non-URL string shows a validation error in the chrome.
- The webview's session is isolated: cookies set in the embedded page are not visible to the main renderer's `document.cookie`.
- DevTools opened via right-click → Inspect Element on the embedded page shows the embedded site's DOM.
- Clicking a link that would open in a new window navigates the same webview instead.
- A `mailto:` link opens the OS default mail client, not the webview.

## Test plan

1. Navigate to `https://example.com`, confirm load.
2. Click a link, navigate, click Back, click Forward — confirm history works.
3. Type `wikipedia.org` (no scheme), confirm `https://` prefix added.
4. Type `chrome://settings`, confirm rejection.
5. Trigger `window.open` on a test page, confirm same-webview navigation.
6. Click `mailto:test@example.com`, confirm OS handler opens.
7. In the webview, set a cookie. In the main renderer DevTools, confirm that cookie is NOT visible.
8. Disconnect network, navigate, confirm error UI with retry button.
