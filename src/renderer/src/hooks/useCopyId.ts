/**
 * TD-069: `Copy ID`'s "it worked", shared by the single-record card, the
 * expanded view of the same record and `CopyIdButton`.
 */

import { useEffect, useRef, useState } from "react";

const COPIED_MS = 1500;

/** `copied` clears itself on a timer rather than being left standing. */
export function useCopyId(id: string): { copied: boolean; copy: () => void } {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(copiedTimer.current);
    };
  }, []);

  async function copyId(): Promise<void> {
    if (id === "") return;
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
