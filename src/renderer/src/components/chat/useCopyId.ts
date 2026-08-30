/**
 * TD-069: `Copy ID`'s "it worked", shared by the single-record card and the
 * expanded view of the same record.
 */

import { useRef, useState } from "react";

const COPIED_MS = 2000;

/** `copied` clears itself on a timer rather than being left standing. */
export function useCopyId(id: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function copyId(): Promise<void> {
    if (!("clipboard" in navigator)) return;
    try {
      await navigator.clipboard.writeText(id);
    } catch (error) {
      console.error("[useCopyId] copy failed", error);
      return;
    }
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  return {
    copied,
    copy: () => {
      void copyId();
    },
  };
}
