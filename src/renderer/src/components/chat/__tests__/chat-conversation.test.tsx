/**
 * TD-073: the conversation id has to survive a reload, because the
 * transcript does. Before this the renderer restored the turns and the
 * server held an empty conversation, so a follow-up reached the model with
 * no context underneath answers the user could still read — and nothing
 * threw.
 *
 * `sessionStorage` is what `App.tsx` hands the store and what survives a
 * reload, so a reload is reproduced here by unmounting the provider and
 * mounting a fresh one over the same storage.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ChatProvider,
  useChat,
  useChatActions,
  type ChatSend,
  type ConversationRef,
  type TurnLifecycle
} from "@swaff-y/thunder-chat-core";
import { answer } from "./fixtures";

const MINTED: ConversationRef = { id: "conv-1", baseUrl: "https://context.example" };

function Controls() {
  const { turns } = useChat();
  const { ask, clear } = useChatActions();
  return (
    <>
      <button onClick={() => void ask("show me the first one")}>ask</button>
      <button onClick={() => void clear()}>clear</button>
      <ul>
        {turns.map((turn) => (
          <li key={turn.id}>{turn.answer ?? ""}</li>
        ))}
      </ul>
    </>
  );
}

function renderChat(send: ChatSend) {
  return render(
    <ChatProvider send={send} storage={sessionStorage}>
      <Controls />
    </ChatProvider>
  );
}

/** The fourth positional argument to `send` — the turn's lifecycle. */
function lifecycleOf(send: { mock: { calls: unknown[][] } }, call = 0): TurnLifecycle | undefined {
  return send.mock.calls[call]?.[3] as TurnLifecycle | undefined;
}

/** A transport that mints a conversation on the first question, as main does. */
function mintingSend(ref: ConversationRef = MINTED): ReturnType<typeof vi.fn<ChatSend>> {
  return vi.fn<ChatSend>(async (_question, _history, _onStatus, lifecycle) => {
    if (!lifecycle?.conversation) lifecycle?.onConversation?.(ref);
    return answer("here it is");
  });
}

describe("the conversation a question continues (TD-073)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("carries the stored conversation on a question asked after a reload", async () => {
    const user = userEvent.setup();
    const first = mintingSend();
    const { unmount } = renderChat(first);

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(first).toHaveBeenCalled());
    expect(lifecycleOf(first)?.conversation).toBeFalsy();

    unmount();

    const second = mintingSend();
    renderChat(second);
    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(second).toHaveBeenCalled());
    expect(lifecycleOf(second)?.conversation).toEqual(MINTED);
  });

  it("carries the minted conversation on the next question of the same session", async () => {
    const user = userEvent.setup();
    const send = mintingSend();
    renderChat(send);

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(lifecycleOf(send, 1)?.conversation).toEqual(MINTED);
  });

  it("drops it on clear, so the next question starts a conversation", async () => {
    const user = userEvent.setup();
    const send = mintingSend();
    renderChat(send);

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "clear" }));
    await user.click(screen.getByRole("button", { name: "ask" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(lifecycleOf(send, 1)?.conversation).toBeFalsy();
  });

  // The recovery is the package's — a `POST /turns` that 404s mints a fresh
  // conversation and asks against that. What matters here is the outcome a
  // stored id can never have: a question that fails.
  it("answers a question asked against a conversation the server has swept", async () => {
    const user = userEvent.setup();
    const send = mintingSend();
    const { unmount } = renderChat(send);

    await user.click(screen.getByRole("button", { name: "ask" }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    unmount();

    const afterSweep = mintingSend({ id: "conv-2", baseUrl: MINTED.baseUrl });
    renderChat(afterSweep);
    await user.click(screen.getByRole("button", { name: "ask" }));

    // Two answers: the restored one and the one asked against the swept id.
    await waitFor(() => expect(screen.getAllByText("here it is")).toHaveLength(2));
  });
});
