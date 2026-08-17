import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatProvider, type ChatSend } from "../../../hooks/useChat";
import ChatPanel from "../ChatPanel";
import { answer, deferredAnswer } from "./fixtures";

const reauthenticate = vi.fn(async () => ({ token: "t", apiKey: "k" }));

vi.mock("../../../api/auth", () => ({
  reauthenticate: () => reauthenticate(),
}));

const cancelRequest = vi.fn();

function renderPanel(send: ChatSend) {
  return render(
    <ChatProvider send={send} cancelRequest={cancelRequest}>
      <ChatPanel />
    </ChatProvider>
  );
}

function composer(): HTMLInputElement {
  return screen.getByLabelText("Ask the catalogue");
}

describe("ChatPanel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    reauthenticate.mockClear();
    cancelRequest.mockClear();
  });

  it("shows only the composer while there is no conversation", () => {
    renderPanel(vi.fn(async () => answer("unused")));

    expect(composer()).toBeInTheDocument();
    expect(screen.queryByText("node-chat")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("reveals the header and transcript once a turn exists", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await user.type(composer(), "who is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("node-chat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
  });

  it("does not send an empty or whitespace-only question", async () => {
    const user = userEvent.setup();
    const send = vi.fn(async () => answer("unused"));
    renderPanel(send);

    await user.click(composer());
    await user.keyboard("{Enter}");
    await user.type(composer(), "   ");
    await user.keyboard("{Enter}");

    expect(send).not.toHaveBeenCalled();
  });

  it("disables the composer while a turn is pending and re-enables it once resolved", async () => {
    const user = userEvent.setup();
    const pending = deferredAnswer();
    renderPanel(vi.fn(() => pending.promise));

    await user.type(composer(), "who is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(composer()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Ask" })).not.toBeInTheDocument();

    pending.resolve(answer("Nick Cage"));

    await waitFor(() => expect(composer()).toBeEnabled());
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
  });

  it("keeps the question and offers a Retry that re-sends after an unauthorized failure", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>(async () => ({
      ok: false,
      error: "unauthorized",
      message: "expired",
    }));
    renderPanel(send);

    await user.type(composer(), "who is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Your session expired.")).toBeInTheDocument();
    expect(screen.getByText("who is popular?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(reauthenticate).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[1][0]).toBe("who is popular?");
    // Retried in place — the transcript keeps one entry per question.
    expect(screen.getAllByText("who is popular?")).toHaveLength(1);
  });

  it("cancels the in-flight request and re-enables the composer when Stop is clicked", async () => {
    const user = userEvent.setup();
    const pending = deferredAnswer();
    renderPanel(vi.fn(() => pending.promise));

    await user.type(composer(), "who is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(cancelRequest).toHaveBeenCalledTimes(1);
    expect(composer()).toBeEnabled();
    expect(screen.getByText("Stopped.")).toBeInTheDocument();
  });
});
