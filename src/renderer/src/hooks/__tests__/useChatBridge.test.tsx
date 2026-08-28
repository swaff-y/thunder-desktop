import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ChatStatus, TurnUsage } from "@swaff-y/thunder-chat-core";
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

const ANSWER = { ok: true, text: "hi", truncated: false } as const;

let pushStatus: ((status: ChatStatus) => void) | undefined;
let pushUsage: ((usage: TurnUsage) => void) | undefined;
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
});
