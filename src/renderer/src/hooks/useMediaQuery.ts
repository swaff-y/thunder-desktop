// Desktop-only stub. web-thunder's hook returned a live media-query result;
// here the renderer is always desktop, so consumers short-circuit to true.
export function useIsDesktop(): boolean {
  return true
}
