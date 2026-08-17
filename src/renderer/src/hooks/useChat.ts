import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";
import React from "react";
import type {
  ChatAction,
  ChatAskResult,
  ChatErrorKind,
  ChatHistoryTurn,
  ChatStatus,
} from "../../../shared/chat";

const STORAGE_KEY = "thunder_chat";

/**
 * The main-process error vocabulary plus one the renderer owns:
 * `interrupted` marks a turn whose request died with the old renderer.
 */
export type ChatError = ChatErrorKind | "interrupted";

export interface ChatTurn {
  id: string;
  question: string;
  answer?: string;
  pending?: boolean;
  tool?: string;
  action?: ChatAction;
  error?: ChatError;
  /** The failure's own words, for the kinds that have no fixed copy. */
  message?: string;
}

type ChatTurnPatch = Omit<Partial<ChatTurn>, "id">;

export type ChatSend = (
  question: string,
  history: ChatHistoryTurn[],
  onStatus: (status: ChatStatus) => void
) => Promise<ChatAskResult>;

interface ChatState {
  turns: ChatTurn[];
  status: ChatStatus;
  error: ChatError | null;
  isEmpty: boolean;
}

interface ChatActions {
  ask: (question: string) => Promise<void>;
  /** Re-asks a failed turn's question in place, rather than below it. */
  retry: (id: string) => Promise<void>;
  clear: () => void;
  cancel: () => void;
}

type ChatContextValue = ChatState & ChatActions;

const IDLE: ChatStatus = { state: "idle" };
const THINKING: ChatStatus = { state: "thinking" };

/** Only answered turns are worth replaying — pending and failed ones have no assistant text. */
function toHistory(turns: ChatTurn[]): ChatHistoryTurn[] {
  return turns.flatMap((turn) =>
    turn.answer
      ? [
          { role: "user" as const, text: turn.question },
          { role: "assistant" as const, text: turn.answer },
        ]
      : []
  );
}

// State and actions are separate contexts so that consumers which only need
// the actions — AuthProvider, for its logout clear — don't re-render on every
// status tick of an in-flight question.
const ChatStateContext = createContext<ChatState | null>(null);
const ChatActionsContext = createContext<ChatActions | null>(null);

function isOptional(value: unknown, type: "string" | "boolean" | "object"): boolean {
  return value === undefined || typeof value === type;
}

function isChatTurn(value: unknown): value is ChatTurn {
  if (typeof value !== "object" || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    typeof turn.id === "string" &&
    typeof turn.question === "string" &&
    isOptional(turn.answer, "string") &&
    isOptional(turn.pending, "boolean") &&
    isOptional(turn.tool, "string") &&
    isOptional(turn.error, "string") &&
    isOptional(turn.message, "string") &&
    isOptional(turn.action, "object")
  );
}

// Pending turns can't survive a reload — the in-flight request died with the
// old renderer — so they come back marked interrupted rather than spinning.
function loadTurns(): ChatTurn[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isChatTurn)) return [];
    return parsed.map((turn) =>
      turn.pending ? { ...turn, pending: false, error: "interrupted" as const } : turn
    );
  } catch {
    return [];
  }
}

function isQuotaExceeded(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === "QuotaExceededError"
  );
}

function persistTurns(turns: ChatTurn[]): void {
  let remaining = turns;
  while (remaining.length > 0) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
      return;
    } catch (error) {
      if (!isQuotaExceeded(error)) return;
      remaining = remaining.slice(1);
    }
  }
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}

export function ChatProvider({
  children,
  send,
  cancelRequest,
}: PropsWithChildren<{ send?: ChatSend; cancelRequest?: () => void }>): React.JSX.Element {
  const [turns, setTurns] = useState<ChatTurn[]>(loadTurns);
  const [status, setStatus] = useState<ChatStatus>(IDLE);
  const [error, setError] = useState<ChatError | null>(null);
  const turnsRef = useRef(turns);
  const activeIdRef = useRef<string | null>(null);
  const abandonedRef = useRef(new Set<string>());

  useEffect(() => {
    turnsRef.current = turns;
    persistTurns(turns);
  }, [turns]);

  const resolveTurn = useCallback((id: string, patch: ChatTurnPatch) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }, []);

  // The turn itself always takes its patch, but `status` and `error` describe
  // the question the user is waiting on — a straggler from an earlier `ask`
  // must not overwrite them.
  const settle = useCallback(
    (id: string, patch: ChatTurnPatch, nextError: ChatError | null) => {
      if (abandonedRef.current.delete(id)) return;
      resolveTurn(id, patch);
      if (activeIdRef.current !== id) return;
      activeIdRef.current = null;
      setStatus(IDLE);
      setError(nextError);
    },
    [resolveTurn]
  );

  const ask = useCallback(
    async (question: string) => {
      const id = crypto.randomUUID();
      const history = toHistory(turnsRef.current);

      setTurns((prev) => [...prev, { id, question, pending: true }]);
      setError(null);
      setStatus(THINKING);
      activeIdRef.current = id;

      if (!send) {
        settle(id, { pending: false, error: "unreachable" }, "unreachable");
        return;
      }

      try {
        const result = await send(question, history, (next) => {
          if (activeIdRef.current === id) setStatus(next);
        });
        if (result.ok) {
          settle(
            id,
            {
              pending: false,
              answer: result.text,
              tool: result.action.tool ?? undefined,
              action: result.action,
            },
            null
          );
        } else {
          settle(
            id,
            { pending: false, error: result.error, message: result.message },
            result.error
          );
        }
      } catch {
        settle(id, { pending: false, error: "unknown" }, "unknown");
      }
    },
    [send, settle]
  );

  // Dropping the failed turn first keeps one entry per question. A failed
  // turn contributes nothing to `toHistory`, so the replay is unaffected.
  const retry = useCallback(
    async (id: string) => {
      const failed = turnsRef.current.find((turn) => turn.id === id);
      if (!failed) return;
      setTurns((prev) => prev.filter((turn) => turn.id !== id));
      await ask(failed.question);
    },
    [ask]
  );

  const cancel = useCallback(() => {
    const id = activeIdRef.current;
    if (!id) return;
    // Abandoning the turn here only frees the renderer — without this the
    // agent loop in main keeps working on an answer nobody is waiting on.
    cancelRequest?.();
    abandonedRef.current.add(id);
    activeIdRef.current = null;
    resolveTurn(id, { pending: false, error: "cancelled" });
    setStatus(IDLE);
    setError(null);
  }, [cancelRequest, resolveTurn]);

  const clear = useCallback(() => {
    const id = activeIdRef.current;
    if (id) {
      abandonedRef.current.add(id);
      activeIdRef.current = null;
    }
    setTurns([]);
    setStatus(IDLE);
    setError(null);
  }, []);

  const actions = useMemo<ChatActions>(
    () => ({ ask, retry, clear, cancel }),
    [ask, retry, clear, cancel]
  );

  return React.createElement(
    ChatActionsContext.Provider,
    { value: actions },
    React.createElement(
      ChatStateContext.Provider,
      { value: { turns, status, error, isEmpty: turns.length === 0 } },
      children
    )
  );
}

export function useChatActions(): ChatActions {
  const context = useContext(ChatActionsContext);
  if (!context) {
    throw new Error("useChatActions must be used within a ChatProvider");
  }
  return context;
}

export function useChat(): ChatContextValue {
  const state = useContext(ChatStateContext);
  const actions = useChatActions();
  if (!state) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return { ...state, ...actions };
}
