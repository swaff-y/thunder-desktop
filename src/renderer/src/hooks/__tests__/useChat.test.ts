import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { ChatProvider, useChat, type ChatSend, type ChatTurn } from "../useChat";
import { MAX_TURN_TEXT_LENGTH } from "../../../../shared/chat";
import type { ChatAction, ChatAskResult } from "../../../../shared/chat";

const STORAGE_KEY = "thunder_chat";

const NO_ACTION: ChatAction = { kind: "none", tool: null, args: {}, title: "", result: null };

function answer(text: string, action: ChatAction = NO_ACTION): ChatAskResult {
  return { ok: true, text, action, truncated: false };
}

function wrapper(send?: ChatSend) {
  return function ChatWrapper({ children }: { children: ReactNode }) {
    return React.createElement(ChatProvider, { send }, children);
  };
}

function storedTurns(): ChatTurn[] | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function deferred(): { promise: Promise<ChatAskResult>; resolve: (result: ChatAskResult) => void } {
  let resolve!: (result: ChatAskResult) => void;
  const promise = new Promise<ChatAskResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useChat", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds a pending turn on ask and fills in the answer when it resolves", async () => {
    const pending = deferred();
    const send = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    expect(result.current.isEmpty).toBe(true);

    act(() => {
      void result.current.ask("who won?");
    });

    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]).toMatchObject({ question: "who won?", pending: true });
    expect(result.current.status).toEqual({ state: "thinking" });
    expect(result.current.isEmpty).toBe(false);

    const action: ChatAction = {
      kind: "list",
      tool: "search_records",
      args: { query: "who won?" },
      title: "Results",
      result: [],
    };

    await act(async () => {
      pending.resolve(answer("Thunder", action));
    });

    expect(result.current.turns[0]).toMatchObject({
      question: "who won?",
      answer: "Thunder",
      tool: "search_records",
      action,
      pending: false,
    });
    expect(result.current.status).toEqual({ state: "idle" });
    expect(result.current.error).toBeNull();
  });

  it("replays answered turns to send as history", async () => {
    const send = vi.fn<ChatSend>(async () => answer("ok"));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("first");
    });
    await act(async () => {
      await result.current.ask("second");
    });

    expect(send.mock.calls[0][1]).toEqual([]);
    expect(send.mock.calls[1][1]).toEqual([
      { role: "user", text: "first" },
      { role: "assistant", text: "ok" },
    ]);
  });

  // ─── Tool results in history (TD-056) ─────────────────────────────

  function listing(records: unknown, tool = "get_random_records"): ChatAction {
    return { kind: "list", tool, args: {}, title: "Records", result: records };
  }

  it("replays the newest turn's tool result so a follow-up can reference it", async () => {
    const send = vi.fn<ChatSend>(async () =>
      answer("Here's a sample.", listing([{ name: "New New" }]))
    );
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("show me some movies");
    });
    await act(async () => {
      await result.current.ask("show me the first one");
    });

    const [, assistant] = send.mock.calls[1][1];
    expect(assistant.text).toContain("Here's a sample.");
    expect(assistant.text).toContain("get_random_records");
    expect(assistant.text).toContain('[{"name":"New New"}]');
  });

  it("carries the result on the newest answered turn only", async () => {
    const send = vi
      .fn<ChatSend>()
      .mockResolvedValueOnce(answer("first answer", listing([{ name: "Old" }])))
      .mockResolvedValueOnce(answer("second answer", listing([{ name: "New" }])))
      .mockResolvedValue(answer("third answer"));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    for (const question of ["one", "two", "three"]) {
      await act(async () => {
        await result.current.ask(question);
      });
    }

    const history = send.mock.calls[2][1];
    expect(history[1].text).toBe("first answer");
    expect(history[3].text).toContain('[{"name":"New"}]');
  });

  it("truncates a result that would push the turn past the cap", async () => {
    const huge = Array.from({ length: 2000 }, (_, i) => ({ name: `record ${i}` }));
    const send = vi.fn<ChatSend>(async () => answer("Here's a sample.", listing(huge)));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("first");
    });
    await act(async () => {
      await result.current.ask("second");
    });

    const [, assistant] = send.mock.calls[1][1];
    expect(assistant.text.length).toBeLessThanOrEqual(MAX_TURN_TEXT_LENGTH);
    expect(assistant.text).toContain("…");
    expect(assistant.text).toContain("Here's a sample.");
  });

  it("leaves the answer untouched when the turn made no tool call", async () => {
    const send = vi.fn<ChatSend>(async () => answer("just prose"));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("first");
    });
    await act(async () => {
      await result.current.ask("second");
    });

    expect(send.mock.calls[1][1][1].text).toBe("just prose");
  });

  it("leaves failed turns out of history", async () => {
    const send = vi
      .fn<ChatSend>()
      .mockResolvedValueOnce({ ok: false, error: "rate_limited", message: "slow down" })
      .mockResolvedValue(answer("ok"));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("first");
    });
    await act(async () => {
      await result.current.ask("second");
    });

    expect(send.mock.calls[1][1]).toEqual([]);
  });

  it("surfaces the failure kind reported by send", async () => {
    const send = vi.fn<ChatSend>(async () => ({
      ok: false,
      error: "bedrock_access_denied",
      message: "no model access"
    }));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("hello");
    });

    expect(result.current.turns[0]).toMatchObject({
      pending: false,
      error: "bedrock_access_denied",
    });
    expect(result.current.error).toBe("bedrock_access_denied");
    expect(result.current.status).toEqual({ state: "idle" });
  });

  it("reports calling-tool status while send is running", async () => {
    const pending = deferred();
    const send = vi.fn<ChatSend>((_question, _history, onStatus) => {
      onStatus({ state: "calling-tool", tool: "list_categories" });
      return pending.promise;
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      void result.current.ask("what categories?");
    });

    expect(result.current.status).toEqual({ state: "calling-tool", tool: "list_categories" });

    await act(async () => {
      pending.resolve(answer("three"));
    });

    expect(result.current.status).toEqual({ state: "idle" });
  });

  it("marks the turn failed when send rejects", async () => {
    const send = vi.fn<ChatSend>(async () => {
      throw new Error("bridge down");
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("hello");
    });

    expect(result.current.turns[0]).toMatchObject({ pending: false, error: "unknown" });
    expect(result.current.turns[0].answer).toBeUndefined();
    expect(result.current.error).toBe("unknown");
    expect(result.current.status).toEqual({ state: "idle" });
  });

  it("fails the turn when no send bridge is supplied", async () => {
    const { result } = renderHook(() => useChat(), { wrapper: wrapper() });

    await act(async () => {
      await result.current.ask("hello");
    });

    expect(result.current.turns[0]).toMatchObject({ pending: false, error: "unreachable" });
    expect(result.current.error).toBe("unreachable");
  });

  it("round-trips turns through sessionStorage", async () => {
    const send = vi.fn<ChatSend>(async () => answer("Thunder"));
    const first = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await first.result.current.ask("who won?");
    });

    expect(storedTurns()).toHaveLength(1);
    first.unmount();

    const second = renderHook(() => useChat(), { wrapper: wrapper(send) });
    expect(second.result.current.turns[0]).toMatchObject({
      question: "who won?",
      answer: "Thunder",
    });
  });

  it("restores pending turns as interrupted", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "a", question: "still thinking?", pending: true }])
    );

    const { result } = renderHook(() => useChat(), { wrapper: wrapper() });

    expect(result.current.turns[0]).toMatchObject({ pending: false, error: "interrupted" });
    expect(result.current.status).toEqual({ state: "idle" });
    expect(result.current.error).toBeNull();
  });

  it("resets to empty when stored JSON is malformed", () => {
    sessionStorage.setItem(STORAGE_KEY, "{not json");

    const { result } = renderHook(() => useChat(), { wrapper: wrapper() });

    expect(result.current.turns).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });

  it("does not let a straggler from an earlier ask clobber the active turn", async () => {
    const first = deferred();
    const second = deferred();
    const send = vi.fn<ChatSend>().mockReturnValueOnce(first.promise).mockReturnValue(second.promise);
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    act(() => {
      void result.current.ask("first");
    });
    act(() => {
      void result.current.ask("second");
    });

    await act(async () => {
      first.resolve({ ok: false, error: "rate_limited", message: "slow down" });
    });

    expect(result.current.turns[0]).toMatchObject({ pending: false, error: "rate_limited" });
    expect(result.current.turns[1]).toMatchObject({ pending: true });
    expect(result.current.error).toBeNull();
    expect(result.current.status).toEqual({ state: "thinking" });

    await act(async () => {
      second.resolve(answer("done"));
    });

    expect(result.current.turns[1]).toMatchObject({ answer: "done", pending: false });
    expect(result.current.status).toEqual({ state: "idle" });
  });

  it("resets to empty when stored turns have optional fields of the wrong type", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "a", question: "who won?", error: 12345 }])
    );

    const { result } = renderHook(() => useChat(), { wrapper: wrapper() });

    expect(result.current.turns).toEqual([]);
  });

  it("resets to empty when stored turns have the wrong shape", () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([{ nope: true }]));

    const { result } = renderHook(() => useChat(), { wrapper: wrapper() });

    expect(result.current.turns).toEqual([]);
  });

  it("clear empties the transcript and removes the storage key", async () => {
    const send = vi.fn<ChatSend>(async () => answer("Thunder"));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("who won?");
    });
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

    act(() => {
      result.current.clear();
    });

    expect(result.current.turns).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("ignores a send that resolves after clear", async () => {
    const pending = deferred();
    const send = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    act(() => {
      void result.current.ask("who won?");
    });
    act(() => {
      result.current.clear();
    });

    await act(async () => {
      pending.resolve(answer("too late"));
    });

    expect(result.current.turns).toEqual([]);
  });

  it("cancel marks the in-flight turn cancelled and ignores the late answer", async () => {
    const pending = deferred();
    const send = vi.fn(() => pending.promise);
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    act(() => {
      void result.current.ask("who won?");
    });
    act(() => {
      result.current.cancel();
    });

    expect(result.current.turns[0]).toMatchObject({ pending: false, error: "cancelled" });
    expect(result.current.status).toEqual({ state: "idle" });

    await act(async () => {
      pending.resolve(answer("too late"));
    });

    expect(result.current.turns[0].answer).toBeUndefined();
    expect(result.current.turns[0].error).toBe("cancelled");
  });

  it("cancel is a no-op when nothing is in flight", () => {
    const { result } = renderHook(() => useChat(), { wrapper: wrapper() });

    act(() => {
      result.current.cancel();
    });

    expect(result.current.turns).toEqual([]);
    expect(result.current.status).toEqual({ state: "idle" });
  });

  it("drops the oldest turns when sessionStorage hits its quota", async () => {
    const send = vi.fn<ChatSend>(async (question) => answer(`re: ${question}`));
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("one");
    });
    await act(async () => {
      await result.current.ask("two");
    });

    const setItem = vi.spyOn(Storage.prototype, "setItem");
    setItem.mockImplementationOnce(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    setItem.mockImplementation(() => {});

    await act(async () => {
      await result.current.ask("three");
    });

    const retried: ChatTurn[] = JSON.parse(setItem.mock.calls[1][1]);
    expect(retried).toHaveLength(2);
    expect(retried[0].question).toBe("two");
    expect(result.current.turns).toHaveLength(3);
  });

  it("keeps the transcript in state when a non-quota storage error is thrown", async () => {
    const send = vi.fn<ChatSend>(async () => answer("ok"));
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(send) });

    await act(async () => {
      await result.current.ask("one");
    });

    expect(setItem).toHaveBeenCalledTimes(1);
    expect(result.current.turns).toHaveLength(1);
  });
});
