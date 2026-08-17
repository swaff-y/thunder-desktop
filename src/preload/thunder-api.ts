import { ipcRenderer } from 'electron'
import { THUNDER_BROWSER_PARTITION } from '../shared/browser'
import type {
  ChatAction,
  ChatActionKind,
  ChatAskRequest,
  ChatAskResult,
  ChatErrorKind,
  ChatHistoryTurn,
  ChatStatus
} from '../shared/chat'
import type { ThunderSettings } from '../shared/settings'

export { THUNDER_BROWSER_PARTITION }
export type { ThunderSettings }
export type {
  ChatAction,
  ChatActionKind,
  ChatAskRequest,
  ChatAskResult,
  ChatErrorKind,
  ChatHistoryTurn,
  ChatStatus
}

/**
 * IPC channels exposed across the main / preload / renderer boundary.
 * Centralised so main-process senders and the renderer's
 * `window.thunder.*` consumers can't drift on string literals.
 */
export const THUNDER_IPC_CHANNELS = {
  /**
   * Native menu → renderer fan-out. Payload is a {@link ThunderMenuAction}.
   * Future tickets that add custom menu items wire them here; the v1
   * scaffold has no actions yet.
   *
   * NOTE: the renderer-side subscription helper (`window.thunder.menu.onAction`,
   * mirroring halo-desktop's pattern) is intentionally deferred — it
   * has nothing to listen for while {@link ThunderMenuAction} is `never`.
   * The first ticket that adds a real action should also add the
   * `ipcRenderer.on` bridge in `preload/index.ts` and the `menu` key
   * on {@link ThunderApi}.
   */
  menuAction: 'thunder:menu:action',

  /**
   * TD-030: encrypted credential store. The renderer NEVER touches the
   * credential file or `safeStorage` directly — these channels are the
   * only path. Main-process handlers are registered in `main/ipc/auth.ts`.
   */
  authGet: 'thunder:auth:get',
  authSet: 'thunder:auth:set',
  authClear: 'thunder:auth:clear',

  /**
   * TD-052: encrypted AWS credential store backing Bedrock's SigV4
   * signing. Handlers are registered in `main/ipc/aws-creds.ts`.
   *
   * Note the missing getter — that asymmetry with `auth:*` is
   * deliberate and load-bearing. IAM keys are a standing grant against
   * the user's AWS account, so the sandboxed renderer can ask whether
   * credentials exist (`has`, for the Settings indicator) but has no
   * path to read them back. Do not add `thunder:aws:get`.
   */
  awsSet: 'thunder:aws:set',
  awsClear: 'thunder:aws:clear',
  awsHas: 'thunder:aws:has',

  /**
   * TD-018: JSON-backed settings store at `<userData>/thunder-desktop-settings.json`.
   * Main-process handlers are registered in `main/ipc/settings.ts`.
   */
  settingsGet: 'thunder:settings:get',
  settingsSet: 'thunder:settings:set',
  settingsGetAll: 'thunder:settings:get-all',

  /**
   * TD-021: routes a URL to the OS default handler via `shell.openExternal`,
   * gated by an allowlist in `main/ipc/shell.ts`. Used by the embedded
   * `<webview>` for `mailto:`/`tel:` links the user clicks inside a page.
   */
  shellOpenExternal: 'thunder:shell:open-external',

  /**
   * TD-022: video-asset detection on the embedded browser session.
   * `browserAssetDetected` is a one-way main → renderer push fired
   * from the partition's `webRequest.onResponseStarted` listener;
   * `browserAssetsGetCurrent` lets the renderer reconcile its list on
   * mount / tab re-entry without waiting for the next detection.
   * Handlers in `main/ipc/browser-detect.ts`.
   */
  browserAssetDetected: 'thunder:browser:asset-detected',
  browserAssetsGetCurrent: 'thunder:browser:assets:get-current',

  /**
   * TD-024: browser-tab download manager. `start` / `cancel` /
   * `showInFolder` are renderer → main invokes; `progress` /
   * `complete` are one-way main → renderer pushes (mirroring the
   * halo-desktop updater fan-out). Handlers in
   * `main/ipc/browser-download.ts`.
   */
  browserDownloadStart: 'thunder:browser:download:start',
  browserDownloadCancel: 'thunder:browser:download:cancel',
  browserDownloadShowInFolder: 'thunder:browser:download:show-in-folder',
  browserDownloadProgress: 'thunder:browser:download:progress',
  browserDownloadComplete: 'thunder:browser:download:complete',

  /**
   * TD-035: wipe the embedded browser's partition (cookies,
   * localStorage, session storage, cache) and the in-memory detection
   * state on logout so a different user's login session can't see the
   * previous one's pages, sessions, or detections. Handler in
   * `main/ipc/browser-detect.ts`.
   */
  browserSessionClear: 'thunder:browser:session:clear',

  /**
   * TD-047: native "Save image" context menu for the embedded Browser
   * tab. Renderer forwards the webview's `context-menu` params; main
   * gates on partition, builds an Electron `Menu` and pops it. The
   * click handler reuses the TD-024 download pipeline so the image
   * lands in the same downloads drawer as a detected asset. Handler in
   * `main/ipc/browser-context-menu.ts`.
   */
  browserContextMenuShow: 'thunder:browser:context-menu:show',

  /**
   * TD-026: native dialog bridge. `openDirectory` drives the folder
   * picker behind Settings' "Choose…" button and probes the chosen
   * folder for writability before returning. `showItemInFolder`
   * reveals a path in the OS file manager — used by the downloads
   * surface to "Show in Finder" a completed file. Handlers in
   * `main/ipc/dialog.ts`.
   */
  dialogOpenDirectory: 'thunder:dialog:open-directory',
  dialogShowItemInFolder: 'thunder:dialog:show-item-in-folder',

  /**
   * TD-054: the AI chat's Bedrock agent loop. `ask` and `cancel` are
   * renderer → main invokes; `status` is a one-way main → renderer push
   * driving the "Running catalogue query…" spinner. Handlers are
   * registered in `main/ipc/chat.ts`.
   *
   * All three no-op while `chatEnabled` is false — no LLM or AWS call
   * is made, and no status is ever pushed.
   */
  chatAsk: 'thunder:chat:ask',
  chatCancel: 'thunder:chat:cancel',
  chatStatus: 'thunder:chat:status'
} as const

/**
 * The set of channels the renderer is permitted to invoke through the
 * generic `window.thunder.invoke` escape hatch. Anything outside this
 * list is rejected in the preload before reaching `ipcRenderer.invoke`,
 * so an attacker who somehow obtained a renderer handle still can't
 * drive arbitrary main-process IPC.
 *
 * `menuAction` and `chatStatus` are intentionally excluded — they're
 * one-way main → renderer channels, not invoke-able. Add new channels
 * here as their handlers ship.
 */
export const THUNDER_ALLOWLIST: ReadonlyArray<string> = [
  THUNDER_IPC_CHANNELS.authGet,
  THUNDER_IPC_CHANNELS.authSet,
  THUNDER_IPC_CHANNELS.authClear,
  THUNDER_IPC_CHANNELS.awsSet,
  THUNDER_IPC_CHANNELS.awsClear,
  THUNDER_IPC_CHANNELS.awsHas,
  THUNDER_IPC_CHANNELS.settingsGet,
  THUNDER_IPC_CHANNELS.settingsSet,
  THUNDER_IPC_CHANNELS.settingsGetAll,
  THUNDER_IPC_CHANNELS.shellOpenExternal,
  THUNDER_IPC_CHANNELS.browserAssetsGetCurrent,
  THUNDER_IPC_CHANNELS.browserDownloadStart,
  THUNDER_IPC_CHANNELS.browserDownloadCancel,
  THUNDER_IPC_CHANNELS.browserDownloadShowInFolder,
  THUNDER_IPC_CHANNELS.browserSessionClear,
  THUNDER_IPC_CHANNELS.browserContextMenuShow,
  THUNDER_IPC_CHANNELS.dialogOpenDirectory,
  THUNDER_IPC_CHANNELS.dialogShowItemInFolder,
  THUNDER_IPC_CHANNELS.chatAsk,
  THUNDER_IPC_CHANNELS.chatCancel
]

/**
 * Union of every renderer-facing action the native menu can fire.
 * Empty in TD-002 — the channel exists but the menu's only non-role
 * items (New Window, Help → GitHub) are handled entirely in main.
 */
export type ThunderMenuAction = never

/**
 * TD-030: shape of credentials persisted via the keychain. `password` is
 * present iff the user opted into "Stay signed in" — its presence is
 * what enables silent reauth on token expiry.
 */
export interface ThunderAuthCredentials {
  token: string
  apiKey: string
  /** Optional — pre-TD-030 migrations only carry token + apiKey.
   *  Required for silent reauth; absence simply means no auto-refresh. */
  email?: string
  /** Present iff "Stay signed in" was checked at login time. */
  password?: string
}

/**
 * TD-052: shape of the AWS credentials the renderer submits to
 * `window.thunder.aws.set`. Write-only across the boundary — nothing
 * ever returns this shape to the renderer.
 */
export interface ThunderAwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  /** Present only for temporary (STS / SSO) credentials. */
  sessionToken?: string
}

/**
 * TD-022: shape of the event the main process pushes whenever the
 * embedded browser receives a response that matches the video-asset
 * detection rules. `sizeBytes` is forwarded from `Content-Length`
 * when the server sends it; chunked responses (HLS manifests over
 * h2, signed-url APIs) often omit it, so consumers must treat it as
 * optional rather than implementing a "size unknown" sentinel.
 */
export interface ThunderAssetDetectedPayload {
  id: string
  pageUrl: string
  assetUrl: string
  mimeType: string
  sizeBytes?: number
  detectedAt: number
}

/**
 * TD-024: payloads emitted by the main-process download manager.
 * `progress` is throttled to ≤4 events/sec per item; `complete` fires
 * exactly once per started download (regardless of outcome).
 */
export interface ThunderDownloadProgressPayload {
  id: string
  receivedBytes: number
  totalBytes: number
  state: 'progressing' | 'interrupted'
}

export interface ThunderDownloadCompletePayload {
  id: string
  state: 'completed' | 'cancelled' | 'interrupted'
  savePath: string
}

/**
 * TD-047: shape the renderer forwards from the webview's `context-menu`
 * event. Only the fields the main-process handler needs are carried —
 * notably NOT `params.frame`, which is a live `WebFrameMain` and can't
 * survive IPC serialisation. `webContentsId` is the webview guest's id
 * (renderer obtains it via `webview.getWebContentsId()`); main uses it
 * to gate the menu to the Browser-tab partition.
 *
 * `mediaType` mirrors Electron's `ContextMenuParams.mediaType` union so
 * the type is self-documenting at every consumer — main's handler
 * narrows it with `=== 'image'` rather than treating it as an opaque
 * string.
 */
export type ThunderContextMenuMediaType =
  | 'none'
  | 'image'
  | 'audio'
  | 'video'
  | 'canvas'
  | 'file'
  | 'plugin'

export interface ThunderBrowserContextMenuRequest {
  webContentsId: number
  mediaType: ThunderContextMenuMediaType
  srcURL: string
  pageURL: string
}

/**
 * TD-026: result of `window.thunder.dialog.openDirectory()`.
 * Discriminated union so callers don't need a cast to use `path`:
 * the only variant carrying `path` is the success case.
 *
 * - `{ canceled: true }` — user dismissed the picker; settings unchanged.
 * - `{ canceled: false, error: 'not-writable' }` — the chosen folder
 *   failed the writability probe (e.g., `/System`); renderer should
 *   surface this and refuse to persist the value.
 * - `{ canceled: false, path }` — verified-writable absolute path.
 */
export type ThunderOpenDirectoryResult =
  | { canceled: true }
  | { canceled: false; error: 'not-writable' }
  | { canceled: false; path: string }

/**
 * Typed IPC surface for `window.thunder`.
 */
export interface ThunderApi {
  /**
   * TD-050: the host OS, forwarded from the main process's `process.platform`
   * so the renderer can branch on `darwin` without importing Electron/Node
   * (e.g. reserving space for macOS `hiddenInset` traffic lights).
   */
  platform: NodeJS.Platform
  auth: {
    get: () => Promise<ThunderAuthCredentials | null>
    set: (creds: ThunderAuthCredentials) => Promise<void>
    clear: () => Promise<void>
  }
  /**
   * TD-052: write-only AWS credential store. `has` is the renderer's
   * only read — a boolean for the Settings "configured / not
   * configured" indicator. There is no getter, by design.
   */
  aws: {
    /** Rejects if the OS keychain is unavailable — nothing is persisted. */
    set: (creds: ThunderAwsCredentials) => Promise<void>
    clear: () => Promise<void>
    has: () => Promise<boolean>
  }
  settings: {
    get: <K extends keyof ThunderSettings>(key: K) => Promise<ThunderSettings[K]>
    set: <K extends keyof ThunderSettings>(key: K, value: ThunderSettings[K]) => Promise<void>
    getAll: () => Promise<ThunderSettings>
  }
  shell: {
    openExternal: (url: string) => Promise<boolean>
  }
  dialog: {
    openDirectory: () => Promise<ThunderOpenDirectoryResult>
    showItemInFolder: (path: string) => Promise<void>
  }
  browser: {
    /**
     * Subscribe to detection events from the embedded browser session.
     * Returns an unsubscribe function — call it on unmount to avoid
     * a leaked listener (and a duplicate-event storm if the renderer
     * remounts the Browser tab).
     */
    onAssetDetected: (callback: (payload: ThunderAssetDetectedPayload) => void) => () => void
    /**
     * Fetch the current page's accumulated detections for a webview,
     * keyed by the webview's `webContents.id` (renderer obtains it via
     * `webview.getWebContentsId()`). Used on mount and tab re-entry to
     * avoid showing an empty list while waiting for the next event.
     */
    getCurrentAssets: (webContentsId: number) => Promise<ThunderAssetDetectedPayload[]>
    /**
     * TD-024: download manager for detected assets. `start` returns
     * the id immediately (the download is in flight); progress and
     * completion arrive via the `onProgress` / `onComplete`
     * subscriptions, both of which return an unsubscribe function.
     */
    download: {
      /**
       * TD-046: `queued: true` means the main-process concurrency cap
       * deferred the dispatch. Renderer should label the row "Queued"
       * until the first progress event arrives (at which point the
       * existing progress handler transitions to "Downloading").
       */
      start: (args: {
        assetUrl: string
        suggestedFilename: string
      }) => Promise<{ id: string; queued: boolean }>
      cancel: (args: { id: string }) => Promise<void>
      showInFolder: (args: { id: string }) => Promise<void>
      onProgress: (callback: (payload: ThunderDownloadProgressPayload) => void) => () => void
      onComplete: (callback: (payload: ThunderDownloadCompletePayload) => void) => () => void
    }
    /**
     * TD-035: wipe the persistent webview partition (cookies,
     * localStorage, session storage, cache) and reset in-memory
     * detection state. Called from `useAuth.logout` so the next user
     * session can't see the previous session's data.
     */
    clearSession: () => Promise<void>
    /**
     * TD-047: ask main to pop the native "Save image" context menu for
     * the embedded Browser tab. Main validates the request (partition,
     * mediaType, srcURL scheme) and silently no-ops anything it doesn't
     * recognise — there is no error surface back to the renderer.
     */
    contextMenu: {
      show: (request: ThunderBrowserContextMenuRequest) => Promise<void>
    }
  }
  /**
   * TD-054: the AI chat. The whole agent loop runs in main — the
   * renderer sends a question and receives the finished turn, so a
   * navigation away from Home mid-answer doesn't kill it.
   *
   * Every path no-ops while `chatEnabled` is false: `ask` resolves to a
   * failure without touching Bedrock, `cancel` does nothing, and no
   * status is pushed.
   */
  chat: {
    /**
     * Never rejects — failures come back as `{ ok: false, error }` so
     * the renderer branches on a field rather than a message.
     */
    ask: (request: ChatAskRequest) => Promise<ChatAskResult>
    /** Aborts the in-flight turn, which then resolves `cancelled`. */
    cancel: () => Promise<void>
    /**
     * Subscribe to spinner state. Returns an unsubscribe function —
     * call it on unmount to avoid a leaked listener.
     */
    onStatus: (callback: (status: ChatStatus) => void) => () => void
  }
  /**
   * Generic IPC escape hatch, gated by {@link THUNDER_ALLOWLIST}.
   * Prefer the typed `auth` / `settings` surfaces — `invoke` exists so
   * tests can prove the allowlist rejects arbitrary channels and so
   * future spike code has a forward path before its typed surface lands.
   */
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

export const thunderApi: ThunderApi = {
  platform: process.platform,
  auth: {
    get: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authGet),
    set: (creds) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authSet, creds),
    clear: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.authClear)
  },
  aws: {
    set: (creds) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.awsSet, creds),
    clear: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.awsClear),
    has: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.awsHas)
  },
  settings: {
    get: (key) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.settingsGet, key),
    set: (key, value) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.settingsSet, key, value),
    getAll: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.settingsGetAll)
  },
  shell: {
    openExternal: (url) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.shellOpenExternal, url)
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.dialogOpenDirectory),
    showItemInFolder: (path) =>
      ipcRenderer.invoke(THUNDER_IPC_CHANNELS.dialogShowItemInFolder, { path })
  },
  browser: {
    onAssetDetected: (callback) => {
      // Wrap rather than passing `callback` directly to `ipcRenderer.on`
      // so the unsubscribe closure references the same function instance
      // we registered — `ipcRenderer.removeListener` is identity-based.
      const handler = (_event: unknown, payload: ThunderAssetDetectedPayload): void =>
        callback(payload)
      ipcRenderer.on(THUNDER_IPC_CHANNELS.browserAssetDetected, handler)
      return (): void => {
        ipcRenderer.removeListener(THUNDER_IPC_CHANNELS.browserAssetDetected, handler)
      }
    },
    getCurrentAssets: (webContentsId) =>
      ipcRenderer.invoke(THUNDER_IPC_CHANNELS.browserAssetsGetCurrent, webContentsId),
    download: {
      start: (args) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.browserDownloadStart, args),
      cancel: (args) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.browserDownloadCancel, args),
      showInFolder: (args) =>
        ipcRenderer.invoke(THUNDER_IPC_CHANNELS.browserDownloadShowInFolder, args),
      onProgress: (callback) => {
        const handler = (_event: unknown, payload: ThunderDownloadProgressPayload): void =>
          callback(payload)
        ipcRenderer.on(THUNDER_IPC_CHANNELS.browserDownloadProgress, handler)
        return (): void => {
          ipcRenderer.removeListener(THUNDER_IPC_CHANNELS.browserDownloadProgress, handler)
        }
      },
      onComplete: (callback) => {
        const handler = (_event: unknown, payload: ThunderDownloadCompletePayload): void =>
          callback(payload)
        ipcRenderer.on(THUNDER_IPC_CHANNELS.browserDownloadComplete, handler)
        return (): void => {
          ipcRenderer.removeListener(THUNDER_IPC_CHANNELS.browserDownloadComplete, handler)
        }
      }
    },
    clearSession: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.browserSessionClear),
    contextMenu: {
      show: (request) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.browserContextMenuShow, request)
    }
  },
  chat: {
    ask: (request) => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.chatAsk, request),
    cancel: () => ipcRenderer.invoke(THUNDER_IPC_CHANNELS.chatCancel),
    onStatus: (callback) => {
      const handler = (_event: unknown, status: ChatStatus): void => callback(status)
      ipcRenderer.on(THUNDER_IPC_CHANNELS.chatStatus, handler)
      return (): void => {
        ipcRenderer.removeListener(THUNDER_IPC_CHANNELS.chatStatus, handler)
      }
    }
  },
  invoke: (channel, ...args) => {
    if (!THUNDER_ALLOWLIST.includes(channel)) {
      return Promise.reject(
        new Error(`[thunder] channel "${channel}" is not in the Thunder IPC allowlist`)
      )
    }
    return ipcRenderer.invoke(channel, ...args)
  }
}
