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
import { useChat, type ChatTurn } from "@swaff-y/thunder-chat-core";
import { invalidationsFor } from "./chat-cache";

function newestSettled(turns: ChatTurn[]): ChatTurn | undefined {
  return turns.findLast((turn) => !turn.pending && !turn.error);
}

export default function ChatWriteTracker(): null {
  const { turns } = useChat();
  const queryClient = useQueryClient();
  const settled = newestSettled(turns);
  // Seeded from the transcript as it was at mount, so a restored session does
  // not invalidate on every reload. Only a transition fires.
  const lastSeenRef = useRef(settled?.id);

  useEffect(() => {
    if (settled?.id === lastSeenRef.current) return;
    lastSeenRef.current = settled?.id;
    for (const queryKey of invalidationsFor(settled?.action)) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [settled, queryClient]);

  return null;
}
