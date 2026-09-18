/**
 * TD-086: the chat's own writes are the one write path with nothing behind
 * them, so a rename the model just made leaves the page showing the old name
 * until `staleTime` rolls over. This leaf watches the transcript and
 * invalidates what the turn touched.
 *
 * It lives beside `CurrentViewTracker` in `ChatBridgeProvider` rather than in
 * the panel: `ChatPanel` and `ChatDrawer` unmount when the drawer closes,
 * while the turn keeps running in main.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useChat } from "@swaff-y/thunder-chat-core";
import { invalidationsFor } from "./chat-cache";

export default function ChatWriteTracker(): null {
  const { turns } = useChat();
  const queryClient = useQueryClient();
  const newest = turns.at(-1);
  /**
   * The turn this mount watched go out, and the whole of what separates a
   * write from a transcript. `turns` starts empty and the restored history
   * arrives later, through the same `setTurns` a live answer does, so a
   * settled turn appearing from nowhere is a reload — not something to
   * refetch for. Only a turn seen pending here has actually just run.
   */
  const watchedRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!newest) return;
    if (newest.pending) {
      watchedRef.current = newest.id;
      return;
    }
    if (watchedRef.current !== newest.id) return;
    watchedRef.current = undefined;
    if (newest.error) return;
    for (const queryKey of invalidationsFor(newest.action)) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [newest, queryClient]);

  return null;
}
