# Thunder Desktop — Plan

A native desktop app that mirrors [web-thunder](../web-thunder/) one-to-one as the view layer for the [halo](../halo/) REST API, with one extra capability the web app cannot offer: an embedded web **Browser** tab that detects video assets on visited pages and downloads them to a folder on disk.

Modelled on [halo-desktop](../halo-desktop/) for shell, build, and IPC patterns. UI, theme, routing, and component code lift verbatim from web-thunder.

---

## 1. Goal

Ship a desktop application ("Thunder Desktop") that:

1. **Is functionally identical to web-thunder.** Same login, same navigation (Home, Actors, Series, Movies, Tags, Stats, MultiWatch, Watch), same Thunder theme tokens, same `react-bootstrap` components, same `@tanstack/react-query` data layer, same routes, same styling — pixel-for-pixel where possible.
2. **Talks to the same Halo backend** (`https://uqd749736g.execute-api.ap-southeast-2.amazonaws.com/dev/` by default; configurable). The app is purely a view layer over halo's REST surface — no new backend code in this repo.
3. **Adds a Browser tab** (desktop-only, hidden on mobile breakpoints — though desktop is always the active layout in Electron). The Browser tab embeds a browsable webview, scans rendered pages for video assets, and offers one-click downloads to a user-nominated folder.

### Non-goals

- No mobile builds. Mobile is web-thunder's job.
- No new Halo API endpoints. If web-thunder works against a halo endpoint, so does this app; nothing else.
- No torrent / DRM / paywall bypass logic. The Browser tab downloads what a normal browser could already fetch via direct HTTP — it just makes the URLs visible and the save action one click instead of "right click → Save As".

---

## 2. Tech Stack

**Electron + React 19 + TypeScript + Vite (via `electron-vite`)** — same template as halo-desktop. Justification is identical:

- Maximum code reuse from web-thunder (same React/TS/Vite stack).
- Mature embedded browser via Electron's `<webview>` tag and `WebContentsView` — exactly the primitive the Browser tab needs.
- `electron-builder` for signed `.dmg` / `.app` (and `.exe` / `.AppImage` if cross-platform is wanted later).
- `electron-updater` for background auto-updates, copy halo-desktop's wiring.

**Key dependencies (mirroring web-thunder + halo-desktop):**

| Concern | Package | Notes |
|---|---|---|
| Routing | `react-router-dom` v7 | same as web-thunder |
| Data | `@tanstack/react-query` v5 | + `query-async-storage-persister` + `idb-keyval` for offline cache (copied from halo-desktop) |
| HTTP | `axios` | reuse `web-thunder/src/api/*.ts` verbatim |
| UI | `react-bootstrap` + `bootstrap` | same as web-thunder |
| Charts | `recharts` | for Stats page |
| Icons | `react-icons` | same as web-thunder |
| Virtualization | `@tanstack/react-virtual` | same |
| Auth | `jwt-decode` | same |
| Electron toolkit | `@electron-toolkit/{utils,preload}` | from halo-desktop |
| Updates | `electron-updater` | from halo-desktop |
| Secure tokens | `keytar` *(optional, see §6)* | macOS Keychain — replaces `localStorage` token storage |

**Mobile layout removed.** Web-thunder ships both `MobileLayout` and `DesktopLayout` selected via [useMediaQuery](../web-thunder/src/hooks/useMediaQuery.ts). In Thunder Desktop the renderer is always desktop-class, so:

- Drop `src/layouts/MobileLayout.tsx` and `src/components/mobile/`.
- Hard-wire `DesktopLayout` in `App.tsx`.
- Drop the `useIsDesktop()` gating around routes (Stats becomes always-available).

This is a small, mechanical edit — no logic changes.

---

## 3. Project Layout

Scaffold from the same template halo-desktop uses:

```
npm create @quick-start/electron@latest thunder-desktop -- --template react-ts
```

Target tree (lifts web-thunder `src/` into `src/renderer/src/`, mirrors halo-desktop's main/preload split):

```
thunder-desktop/
├── src/
│   ├── main/                          # Electron main process (Node.js)
│   │   ├── index.ts                   # app lifecycle, CSP, IPC registration
│   │   ├── window.ts                  # main BrowserWindow factory (copied from halo-desktop)
│   │   ├── window-state.ts            # persisted size/position (copied from halo-desktop)
│   │   ├── menu.ts                    # native app menu
│   │   ├── updater.ts                 # electron-updater wiring (copied from halo-desktop)
│   │   ├── logger.ts                  # (copied from halo-desktop)
│   │   └── ipc/
│   │       ├── index.ts               # registerAllThunderIpc()
│   │       ├── auth.ts                # keychain get/set/delete (optional, see §6)
│   │       ├── dialog.ts              # showOpenDialog / showSaveDialog
│   │       ├── settings.ts            # download-folder, env URL persistence
│   │       ├── settings-io.ts         # JSON file IO helpers
│   │       ├── browser-detect.ts      # ★ NEW — main-process side of video-asset detection
│   │       └── browser-download.ts    # ★ NEW — session.download with progress events
│   ├── preload/
│   │   ├── index.ts                   # contextBridge → window.thunder
│   │   ├── thunder-api.ts             # typed IPC surface (analogous to halo-api.ts)
│   │   └── index.d.ts                 # ambient d.ts for window.thunder
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx               # ↘
│           ├── App.tsx                # ↘ all of these are
│           ├── api/                   # ↘ literal copies from
│           ├── pages/                 # ↘ web-thunder/src/, with
│           ├── components/desktop/    # ↘ minimal edits (see §4)
│           ├── components/shared/     # ↘
│           ├── layouts/DesktopLayout.tsx  # ↘
│           ├── hooks/                 # ↘
│           ├── theme/                 # ↘ THEME.md tokens, bootstrap-overrides
│           ├── types/                 # ↘
│           ├── utils/                 # ↘
│           ├── config/env.ts          # API_URL via window.thunder.settings.get('apiUrl')
│           └── browser/               # ★ NEW — Browser tab (see §5)
│               ├── BrowserPage.tsx           # route /browser
│               ├── BrowserChrome.tsx         # address bar, back/fwd/reload
│               ├── EmbeddedWebview.tsx       # <webview> wrapper + event hooks
│               ├── DetectedAssetsPanel.tsx   # right rail of detected videos
│               ├── DownloadsDrawer.tsx       # in-progress + completed downloads
│               ├── useBrowserNav.ts          # url, history, loading
│               ├── useDetectedAssets.ts      # subscribes to main-side detector
│               └── useDownloads.ts           # start/pause/cancel via IPC
├── build/                             # entitlements, icons (from halo-desktop)
├── resources/                         # icon.icns / icon.png
├── electron-builder.yml
├── electron.vite.config.ts
├── package.json
└── tsconfig.{json,node.json,web.json}
```

Files marked **★ NEW** are the only meaningful net-new code. Everything else is either a literal copy from web-thunder or a structural copy from halo-desktop.

---

## 4. Mirroring web-thunder

Goal: web-thunder's renderer renders inside Electron with the smallest possible diff.

### 4.1 Files copied verbatim

- `src/api/{client.ts,halo.ts}` → `src/renderer/src/api/`
- `src/pages/*.tsx` → `src/renderer/src/pages/`
- `src/components/desktop/*` → `src/renderer/src/components/desktop/`
- `src/components/shared/*` → `src/renderer/src/components/shared/`
- `src/hooks/*` → `src/renderer/src/hooks/`
- `src/theme/{variables.css,bootstrap-overrides.css}` → `src/renderer/src/theme/`
- `src/types/*` → `src/renderer/src/types/`
- `src/utils/*` → `src/renderer/src/utils/`
- `src/layouts/DesktopLayout.tsx` → `src/renderer/src/layouts/`
- `THEME.md` → `docs/THEME.md` (reference)

### 4.2 Files dropped

- `src/layouts/MobileLayout.tsx`
- `src/components/mobile/*`
- `src/hooks/useMediaQuery.ts` (no longer needed)

### 4.3 Files edited

- **`App.tsx`** — remove `useIsDesktop`, `MobileLayout`, `DesktopOnlyRoute`, `AppLayout` switch. Replace with `DesktopLayout` always. Add the new `/browser` route.
- **`Sidebar.tsx`** — append a Browser nav item:
  ```ts
  { path: "/browser", label: "Browser", icon: IoGlobeOutline }
  ```
  Position: between "Tags" and "Stats", or at the bottom — judgment call at implementation time.
- **`config/env.ts`** — instead of reading `import.meta.env.VITE_API_URL`, read from a renderer-side settings hook backed by `window.thunder.settings.get('apiUrl')`. Default value matches web-thunder's. Means the user can switch between the dev API Gateway URL and a future prod URL without rebuilding.
- **`api/client.ts`** — token still lives in `localStorage` for v1 (web-thunder pattern). Optionally migrated to keychain in a follow-up; see §6.

### 4.4 Theme parity

The Thunder theme is pure CSS variables + Tailwind tokens (see [web-thunder/THEME.md](../web-thunder/THEME.md)). Copy `theme/variables.css` and `theme/bootstrap-overrides.css` unchanged. Import `bootstrap/dist/css/bootstrap.min.css` and the overrides in `main.tsx` in the same order web-thunder does. Visual output should be byte-identical save for OS-level font rendering differences inside Electron's Chromium.

### 4.5 Native menu

Copy halo-desktop's `src/main/menu.ts` and trim halo-specific menu items. Keep:

- File → New Window, Quit
- Edit → standard cut/copy/paste/select-all roles
- View → Reload, Toggle DevTools, Zoom In/Out/Reset
- Window → Minimize, Close
- Help → About

The menu sends `thunder:menu:action` IPC events to the focused window; renderer subscribes via a small `MenuActions` component (copy halo-desktop's pattern).

---

## 5. The Browser Tab

This is the one feature web-thunder cannot have, and the entire reason the desktop app exists. It is **not** a general-purpose web browser — it is a single-tab embedded webview with a video-asset sidecar.

### 5.1 Surface

Layout inside the Browser route, rendered inside the existing `DesktopLayout`:

```
┌── Sidebar ──┬── TopBar ──────────────────────────────────────────┐
│             │                                                    │
│             │  [◀] [▶] [⟳] [ https://example.com/video-page  ] [Go]
│             │                                                    │
│             │  ┌──────────── webview ──────────┬── Detected ────┐│
│             │  │                                │  Assets        ││
│             │  │   embedded page renders here   │                ││
│             │  │                                │  • intro.mp4   ││
│             │  │                                │    [↓ Download]││
│             │  │                                │  • show.m3u8   ││
│             │  │                                │    [↓ Download]││
│             │  └────────────────────────────────┴────────────────┘│
│             │                                                    │
│             │  ┌── Downloads ──────────────────────────────────┐ │
│             │  │ ✓ intro.mp4   12.4 MB   ~/Downloads/Thunder/  │ │
│             │  │ ⬇ show.m3u8   45%       cancelling...         │ │
│             │  └───────────────────────────────────────────────┘ │
└─────────────┴────────────────────────────────────────────────────┘
```

- `BrowserChrome.tsx` — back/forward/reload, address bar with URL validation, "Go" button.
- `EmbeddedWebview.tsx` — wraps the Electron `<webview>` tag (or `WebContentsView` if we go the BrowserView route — see §5.2). Exposes `goBack`, `goForward`, `reload`, `loadURL`. Listens to `did-navigate`, `did-finish-load`, `dom-ready`, `did-fail-load`.
- `DetectedAssetsPanel.tsx` — list of detected video URLs for the *current* page. Each row shows filename, MIME type, size if known, and a Download button.
- `DownloadsDrawer.tsx` — collapsible bottom drawer, shows in-progress and recently completed downloads with progress bars and "Show in Finder" / "Cancel" actions.

### 5.2 Embedding strategy

Two viable options; **recommend `<webview>` for v1**, with a clean migration path to `WebContentsView` if isolation becomes a problem.

| Approach | Pro | Con |
|---|---|---|
| `<webview>` tag | Lives inside the React tree; easy CSS layout; Electron-recommended for embedding untrusted content; isolated process; `webContents` accessible from main via `webContents.fromId(id)`. | Slight performance cost; deprecation rumors come and go but it's still supported and used in Slack/Discord/etc. |
| `WebContentsView` (modern `BrowserView`) | First-class Electron 30+ primitive; better isolation guarantees. | Lives outside the DOM — has to be positioned via `setBounds()` from main, which means the renderer has to ship the embed's geometry over IPC and re-send on every layout change. Painful to keep in sync with React's flexbox. |

**Decision: use `<webview>` for v1.** Keep the implementation behind a small `EmbeddedWebview` component so the swap to `WebContentsView` is contained to one file later if needed.

The `<webview>` is configured with:

- `partition="persist:thunder-browser"` — cookies/storage isolated from the main app's renderer; clears in one operation if the user wants a fresh browsing session.
- `webpreferences="contextIsolation=yes,sandbox=yes,nodeIntegration=no"` — no Node access inside browsed pages.
- `useragent` — modern desktop UA so sites don't fall back to mobile views.
- No content script injection in v1. (Detection happens at the network layer; see §5.3.)

### 5.3 Video-asset detection

Detection runs in the **main process**, attached to the embedded webview's session — not via DOM scraping. This is more reliable: it catches HLS / DASH segments, lazy-loaded sources, and `<video>` elements injected after page load, all without polling the DOM.

Implementation in `src/main/ipc/browser-detect.ts`:

1. On webview `did-attach`, look up its `session` (per-partition) and register a **`webRequest.onResponseStarted`** listener.
2. For each response, inspect:
   - `Content-Type` header — match `video/*` (mp4, webm, ogg, x-matroska, x-msvideo), `application/x-mpegURL` and `application/vnd.apple.mpegurl` (HLS playlists), `application/dash+xml` (DASH manifests).
   - URL extension fallback — `.mp4`, `.webm`, `.mkv`, `.mov`, `.m3u8`, `.mpd`, `.ts` (HLS segments).
   - `Content-Length` if present, for size display.
3. De-duplicate per (page-url, asset-url) pair. Reset the per-page list when the webview emits `did-navigate` to a new top-level URL.
4. Emit `thunder:browser:asset-detected` IPC events to the renderer. Renderer's `useDetectedAssets` hook subscribes and updates its panel.

**HLS / DASH special case.** A single `.m3u8` master playlist is the right thing to download — it's tiny, but it references hundreds of `.ts` segments. We have two paths:

- **v1 (simple):** detect the `.m3u8` URL, download it as-is, leave segment-stitching to the user (e.g. via `ffmpeg -i playlist.m3u8 -c copy out.mp4` — note that ffmpeg is a *user* dependency in v1, the app does not bundle it).
- **v2 (stitched):** bundle a static ffmpeg binary in `resources/`, and when the user clicks Download on an `.m3u8`, run ffmpeg as a child process to produce a single `.mp4`. Track progress by parsing ffmpeg's stderr. Treat this as a follow-up — it doubles the binary size and adds platform-specific build complexity.

**Privacy.** All inspection is local — URLs and headers stay on the device. No telemetry.

### 5.4 Download flow

In `src/main/ipc/browser-download.ts`:

1. Renderer calls `window.thunder.browser.download(assetUrl, suggestedFilename)`.
2. Main calls `session.fromPartition('persist:thunder-browser').downloadURL(assetUrl)` — same session as the embedded webview, so cookies/auth headers ride along (important for sites that gate video URLs behind a session cookie).
3. Main hooks `session.on('will-download', (event, item) => …)`:
   - Resolve target folder from settings (`window.thunder.settings.get('downloadFolder')`, default `~/Downloads/Thunder`).
   - `item.setSavePath(join(folder, suggestedFilename))` (collision-safe with a `(2)`, `(3)` suffix helper).
   - Forward `item.on('updated', ...)` ticks to the renderer as `thunder:browser:download-progress` events: `{ id, receivedBytes, totalBytes, state }`.
   - Forward `item.on('done', ...)` as `thunder:browser:download-complete` with final state (`completed` / `cancelled` / `interrupted`).
4. Renderer's `useDownloads` hook reduces these events into a list rendered in `DownloadsDrawer`.
5. Renderer can call `window.thunder.browser.cancelDownload(id)` → main-side `item.cancel()` (we maintain a `Map<id, DownloadItem>` keyed by a UUID issued at start time).
6. "Show in Finder" → `window.thunder.dialog.showItemInFolder(path)` → main calls `shell.showItemInFolder`.

### 5.5 Settings

Stored in a JSON file in `app.getPath('userData')` via `settings-io.ts` (copy halo-desktop's pattern). Renderer reads/writes via IPC.

- `apiUrl` — base URL for the halo API (default web-thunder's dev URL).
- `downloadFolder` — absolute path. Picked via `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`. Default: `path.join(app.getPath('downloads'), 'Thunder')`, created on first download if absent.
- `userAgent` — optional override for the embedded webview.

Surfaced in a Settings modal accessible from the TopBar (gear icon — net-new, small).

### 5.6 Security boundary

- The Browser tab's webview uses an isolated session and sandboxed renderer — same posture as a real browser tab. Pages cannot reach `window.thunder` (that bridge is only on the main app's renderer).
- The main app's renderer keeps a strict CSP (already installed in halo-desktop's `installProdCsp`); the Browser tab's webview gets its own (lax) CSP because it's loading arbitrary public web pages.
- IPC channels for browser-detect / browser-download are added to the preload allowlist (`THUNDER_ALLOWLIST`, mirrors halo-desktop's `HALO_ALLOWLIST`).
- New-window requests inside the embedded webview (`new-window` event) open in the *same* embedded webview rather than a popup, except for `mailto:` / `tel:` / extension schemes which we forward to `shell.openExternal` after scheme allowlisting (copy `openExternalIfAllowed` from halo-desktop's `window.ts`).

---

## 6. Auth & token storage

v1 — **match web-thunder exactly.** Tokens live in renderer-side `localStorage` (`userToken`, `apiKey`); `api/client.ts` injects them via interceptor. This keeps the diff against web-thunder zero on the auth path.

v2 — *(optional; only if security review pushes back)* migrate to macOS Keychain via `keytar` and an IPC bridge (`window.thunder.auth.{get,set,clear}Token`). Pattern is identical to halo-desktop's `src/main/ipc/auth.ts` + `credentials-store.ts`. Renderer change is scoped to `api/client.ts`.

---

## 7. Build, distribution, updates

Lift halo-desktop's [electron-builder.yml](../halo-desktop/electron-builder.yml) and rename `appId`, `productName`, `executableName`, GitHub `owner`/`repo`. macOS entitlements need:

- `com.apple.security.network.client` (HTTP fetch from the renderer and the webview).
- `com.apple.security.files.user-selected.read-write` (download folder picker).
- `com.apple.security.files.downloads.read-write` (default download folder).

Auto-update wiring: copy `src/main/updater.ts` from halo-desktop. Same toast UX in renderer ("Update available… Installing on next launch").

---

## 8. Phased rollout

| Phase | Scope | Definition of done |
|---|---|---|
| **0. Scaffold** | `electron-vite` template, copy halo-desktop main/preload skeleton with names changed. | App launches, blank renderer, native menu visible. |
| **1. Web-thunder parity** | Copy renderer files per §4. Strip mobile. Wire `api/client.ts` against the dev halo URL. | Login works, all routes (Home, Actors, Series, Movies, Tags, Stats, Watch, MultiWatch) render and behave identically to `npm run dev` in web-thunder. |
| **2. Persisted window + settings** | Window-state file, settings file, settings IPC, Settings modal with API URL + download folder fields. | Resize/move persists across launches; API URL switchable at runtime; download folder pickable. |
| **3. Browser tab — basic** | Sidebar entry, route, `<webview>` with chrome (back/fwd/reload/address bar). No detection yet. | Can browse arbitrary HTTPS sites inside the app. |
| **4. Browser tab — detection** | `webRequest` hook on the webview's session, IPC events, `DetectedAssetsPanel`. | Visiting a page with `<video>` or HLS reveals the asset URLs in the right rail within ~1s of the response landing. |
| **5. Browser tab — downloads** | `will-download` handler, progress IPC, `DownloadsDrawer`, "Show in Finder", cancel. | Click → file lands in chosen folder; progress visible; cancel mid-download leaves a partial file removed. |
| **6. Polish + sign + ship** | macOS code signing, notarization, GitHub release with `electron-updater` feed. | Signed `.dmg` distributed; auto-update verified by bumping version and re-releasing. |
| **7. (Optional) HLS stitching** | Bundle ffmpeg, stitch `.m3u8` → `.mp4` with progress. | `.m3u8` downloads produce a single playable mp4 in the chosen folder. |
| **8. (Optional) Keychain auth** | Move tokens out of `localStorage` into Keychain via IPC. | Tokens not visible in `localStorage`; logout clears keychain entry. |

Phases 0–6 are the actual product. Phases 7 and 8 are nice-to-haves.

---

## 9. Risks & open questions

- **Site anti-embed defenses.** Many video sites set `X-Frame-Options: DENY` or rely on referrer checks that fail inside an embedded context. The Electron `<webview>` is a top-level browsing context, not an iframe, so most of these don't apply — but a few sites detect the Electron UA. Mitigation: configurable UA in settings; default to a current-Chrome UA string.
- **DRM (Widevine / FairPlay).** Sites using EME-based DRM won't decrypt inside the bundled Chromium without a Widevine CDM build. We will not attempt to defeat DRM. Detection still works (URLs are still visible on the wire), but downloaded files will be encrypted segments. This is an acceptable limitation — call it out in the README.
- **Legal scope.** The Browser tab is a download-helper for content the user has the right to download. This will be made explicit in the app's README and About dialog. No "download from YouTube" features, no DRM bypass, no scraping at scale.
- **HLS without ffmpeg in v1.** v1 hands the user a `.m3u8` file. Acceptable for advanced users; rough for casual ones. Phase 7 fixes this.
- **Thunder vs. Halo branding.** Web-thunder uses "Thunder" as the user-facing brand even though the backend is Halo. This plan keeps that — sidebar still says "Thunder", app name is "Thunder Desktop". If we want unified branding, that's a separate, larger conversation.
- **Repo: new vs. monorepo.** Recommend a fresh `thunder-desktop` repo (parallel to `halo-desktop`, `web-thunder`). Mirrors the existing one-app-per-repo convention in `~/ruby_sei/`.

---

## 10. What I want feedback on before I start

1. **Browser tab placement.** Side-nav item between Tags and Stats? Or pin to the bottom of the nav as a tool, separate from the catalog routes?
2. **HLS handling in v1.** OK with raw `.m3u8` download as the v1 behavior, with stitched mp4 as a follow-up? Or is stitched-mp4 a hard requirement for the first ship?
3. **Auth storage.** Stay on `localStorage` for the v1 release (zero diff vs. web-thunder), or invest in keychain up front?
4. **Repo scope.** New `thunder-desktop` repo, or fold into web-thunder under a `desktop/` path?
5. **Default download folder.** `~/Downloads/Thunder` (subfolder, keeps things tidy) or `~/Downloads` (matches user expectations)?
