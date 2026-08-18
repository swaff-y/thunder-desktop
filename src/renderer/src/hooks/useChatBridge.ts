import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ChatStatus } from "../../../shared/chat";
import type { ChatSend } from "./useChat";

interface ChatBridge {
  send: ChatSend;
  /**
   * Aborts the in-flight turn in main. `useChat`'s `cancel` calls this so
   * the server stops burning tokens on an abandoned answer.
   */
  cancelRequest: () => void;
  /**
   * TD-065: drops the conversation on the context server. `useChat`'s
   * `clear` calls this — the transcript lives in two places now.
   */
  clearRequest: () => void;
}

/**
 * TD-056: the renderer half of TD-054's chat IPC. `useChat` owns the
 * transcript; this hook owns the wire, so the store stays testable with a
 * plain function in place of `window.thunder`.
 *
 * The status channel is a single subscription held for the life of the
 * component. Each `send` parks its own listener for the duration of the
 * turn, so a status tick that arrives late is dropped rather than
 * attributed to the next question.
 */
export function useChatBridge(): ChatBridge {
  const listenerRef = useRef<((status: ChatStatus) => void) | null>(null);

  useEffect(() => {
    return window.thunder.chat.onStatus((status) => {
      listenerRef.current?.(status);
    });
  }, []);

  const send = useCallback<ChatSend>(async (question, history, onStatus) => {
    listenerRef.current = onStatus;
    try {
      return await window.thunder.chat.ask({ question, history });
    } finally {
      listenerRef.current = null;
    }
  }, []);

  const cancelRequest = useCallback(() => {
    void window.thunder.chat.cancel();
  }, []);

  const clearRequest = useCallback(() => {
    void window.thunder.chat.clear();
  }, []);

  return useMemo(
    () => ({ send, cancelRequest, clearRequest }),
    [send, cancelRequest, clearRequest]
  );
}
