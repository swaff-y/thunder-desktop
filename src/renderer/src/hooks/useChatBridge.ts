import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Capabilities, ChatStatus, TurnUsage } from "@swaff-y/thunder-chat-core";
import type { ChatSend } from "@swaff-y/thunder-chat-core";

interface ChatBridge {
  send: ChatSend;
  /**
   * TD-072: read once on mount, for the model the summary line names on a
   * chat that has not run a turn yet.
   */
  loadCapabilities: () => Promise<Capabilities | null>;
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
 * The status and usage channels are each a single subscription held for
 * the life of the component. Each `send` parks its own listeners for the
 * duration of the turn, so a tick that arrives late is dropped rather than
 * attributed to the next question.
 */
export function useChatBridge(): ChatBridge {
  const statusRef = useRef<((status: ChatStatus) => void) | null>(null);
  const usageRef = useRef<((usage: TurnUsage) => void) | null>(null);
  // Which turn owns the two slots above. A superseded turn settles *after*
  // the one that replaced it has already claimed them, so it has to prove
  // the sinks are still its own before clearing them — otherwise it takes
  // the live turn's spinner and its cost report down with it.
  const currentTurn = useRef(0);

  useEffect(() => {
    return window.thunder.chat.onStatus((status) => {
      statusRef.current?.(status);
    });
  }, []);

  useEffect(() => {
    return window.thunder.chat.onUsage((usage) => {
      usageRef.current?.(usage);
    });
  }, []);

  const send = useCallback<ChatSend>(
    async (question, history, onStatus, lifecycle, view) => {
      const turn = ++currentTurn.current;
      statusRef.current = onStatus;
      // TD-072: main polls the turn, so the usage arrives as a message
      // rather than as a return value. The store supplies the sink.
      usageRef.current = lifecycle?.onUsage ?? null;
      try {
        // TD-070: the store read the view once, when the question was asked.
        // It travels with the question rather than being re-derived in main,
        // which has no router. `null` and "not on a page worth naming" are
        // the same thing on the wire, so it goes as absent.
        return await window.thunder.chat.ask({ question, history, view: view ?? undefined });
      } finally {
        if (currentTurn.current === turn) {
          statusRef.current = null;
          usageRef.current = null;
        }
      }
    },
    []
  );

  const loadCapabilities = useCallback(() => window.thunder.chat.capabilities(), []);

  const cancelRequest = useCallback(() => {
    void window.thunder.chat.cancel();
  }, []);

  const clearRequest = useCallback(() => {
    void window.thunder.chat.clear();
  }, []);

  return useMemo(
    () => ({ send, loadCapabilities, cancelRequest, clearRequest }),
    [send, loadCapabilities, cancelRequest, clearRequest]
  );
}
