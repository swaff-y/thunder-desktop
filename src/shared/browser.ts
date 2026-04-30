/**
 * TD-022: shared browser-tab constants used across main / preload /
 * renderer. Lives in `shared/` so the renderer can import without
 * pulling in preload's `electron` dependency.
 *
 * The webview's `partition` attribute and the main process's
 * `session.fromPartition()` call must agree on this string — drift
 * means the detection listener attaches to a session no webview ever
 * uses, and detection silently no-ops.
 */
export const THUNDER_BROWSER_PARTITION = 'persist:thunder-browser'
