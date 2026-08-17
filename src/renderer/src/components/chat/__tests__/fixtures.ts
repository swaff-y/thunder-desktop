import type { ChatAction, ChatAskResult } from "../../../../../shared/chat";

export const NO_ACTION: ChatAction = {
  kind: "none",
  tool: null,
  args: {},
  title: "",
  result: null,
};

export function answer(text: string, action: ChatAction = NO_ACTION): ChatAskResult {
  return { ok: true, text, action, truncated: false };
}

export function listAction(
  tool: string,
  args: Record<string, unknown>,
  result: unknown
): ChatAction {
  return { kind: "list", tool, args, title: tool, result };
}

export function singleAction(
  tool: string,
  args: Record<string, unknown>,
  result: unknown
): ChatAction {
  return { kind: "single", tool, args, title: tool, result };
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
