import type { ChatAction, ChatAskResult } from "../../../../../shared/chat";

export const NO_ACTION: ChatAction = {
  kind: "none",
  tool: null,
  args: {},
  title: "",
  result: null,
};

export function answer(text: string): ChatAskResult {
  return { ok: true, text, action: NO_ACTION, truncated: false };
}

export function deferredAnswer(): {
  promise: Promise<ChatAskResult>;
  resolve: (result: ChatAskResult) => void;
} {
  let resolve!: (result: ChatAskResult) => void;
  const promise = new Promise<ChatAskResult>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
