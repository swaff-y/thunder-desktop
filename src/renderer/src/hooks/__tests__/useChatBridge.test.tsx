import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ChatStatus, ConversationRef, TurnUsage } from "@swaff-y/thunder-chat-core";
import { useChatBridge } from "../useChatBridge";

const USAGE: TurnUsage = {
  model: "deepseek.v3.2",
  rounds: 1,
  input_tokens: 1200,
  output_tokens: 300,
  cache_read_input_tokens: 0,
  cache_write_input_tokens: 0,
  cost_usd: 0.004,
  conversation: { turns: 2, input_tokens: 2400, output_tokens: 600, cost_usd: 0.041 },
};

const CONVERSATION: ConversationRef = { id: "conv-1", baseUrl: "https://context.example" };

const ANSWER = { ok: true, text: "hi", truncated: false } as const;

let pushStatus: ((status: ChatStatus) => void) | undefined;
let pushUsage: ((usage: TurnUsage) => void) | undefined;
let pushConversation: ((conversation: ConversationRef) => void) | undefined;
let settle: Array<() => void> = [];

const ask = vi.fn(
  () =>
    new Promise((resolve) => {
      settle.push(() => resolve(ANSWER));
    })
);

beforeEach(() => {
  settle = [];
  ask.mockClear();
  Object.assign(window, {
    thunder: {
      chat: {
        ask,
        cancel: vi.fn(),
        clear: vi.fn(),
        capabilities: vi.fn(),
        onStatus: (callback: (status: ChatStatus) => void) => {
          pushStatus = callback;
          return () => {
            pushStatus = undefined;
          };
        },
        onUsage: (callback: (usage: TurnUsage) => void) => {
          pushUsage = callback;
          return () => {
            pushUsage = undefined;
          };
        },
        onConversation: (callback: (conversation: ConversationRef) => void) => {
          pushConversation = callback;
          return () => {
            pushConversation = undefined;
          };
        },
      },
    },
  });
});

describe("useChatBridge", () => {
  it("routes a turn's status and usage to that turn's sinks", async () => {
    const { result } = renderHook(() => useChatBridge());
    const onStatus = vi.fn();
    const onUsage = vi.fn();

    void result.current.send("hi", [], onStatus, { onUsage });
    pushStatus?.({ state: "thinking" });
    pushUsage?.(USAGE);

    expect(onStatus).toHaveBeenCalledWith({ state: "thinking" });
    expect(onUsage).toHaveBeenCalledWith(USAGE);
  });

  // TD-073: main mints the conversation and only the renderer's store
  // outlives a reload, so the id has to make this trip or the transcript
  // and the server's conversation drift apart silently.
  it("routes a conversation minted in main to that turn's sink", async () => {
    const { result } = renderHook(() => useChatBridge());
    const onConversation = vi.fn();

    void result.current.send("hi", [], vi.fn(), { onConversation });
    pushConversation?.(CONVERSATION);

    expect(onConversation).toHaveBeenCalledWith(CONVERSATION);
  });

  it("carries the store's conversation in the ask payload", async () => {
    const { result } = renderHook(() => useChatBridge());

    void result.current.send("hi", [], vi.fn(), { conversation: CONVERSATION });

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ conversation: CONVERSATION })
    );
  });

  it("sends no conversation when the store has none to send", async () => {
    const { result } = renderHook(() => useChatBridge());

    void result.current.send("hi", [], vi.fn());

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ conversation: undefined }));
  });

  // A superseded turn settles after the one that replaced it has claimed the
  // sinks, so clearing them unconditionally would take the live turn's cost
  // report down with the stale one's.
  it("keeps the live turn's sinks when a superseded turn settles late", async () => {
    const { result } = renderHook(() => useChatBridge());
    const staleUsage = vi.fn();
    const liveUsage = vi.fn();

    const stale = result.current.send("first", [], vi.fn(), { onUsage: staleUsage });
    const live = result.current.send("second", [], vi.fn(), { onUsage: liveUsage });

    settle[0]();
    await stale;

    pushUsage?.(USAGE);
    expect(liveUsage).toHaveBeenCalledWith(USAGE);
    expect(staleUsage).not.toHaveBeenCalled();

    settle[1]();
    await live;
  });

  it("keeps the live turn's conversation sink when a superseded turn settles late", async () => {
    const { result } = renderHook(() => useChatBridge());
    const staleConversation = vi.fn();
    const liveConversation = vi.fn();

    const stale = result.current.send("first", [], vi.fn(), {
      onConversation: staleConversation,
    });
    const live = result.current.send("second", [], vi.fn(), {
      onConversation: liveConversation,
    });

    settle[0]();
    await stale;

    pushConversation?.(CONVERSATION);
    expect(liveConversation).toHaveBeenCalledWith(CONVERSATION);
    expect(staleConversation).not.toHaveBeenCalled();

    settle[1]();
    await live;
  });
});
