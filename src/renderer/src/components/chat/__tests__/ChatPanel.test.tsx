import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ChatProvider, type ChatSend } from "../../../hooks/useChat";
import ChatPanel from "../ChatPanel";
import { answer, deferredAnswer, listAction, singleAction } from "./fixtures";

const reauthenticate = vi.fn(async () => ({ token: "t", apiKey: "k" }));

vi.mock("../../../api/auth", () => ({
  reauthenticate: () => reauthenticate(),
}));

// The cards fetch their pictures by id; this panel's tests are about the
// transcript, not about what Halo returns for an image slot.
vi.mock("../useActionImages", () => ({
  useActionImages: () => ({ slides: [], isLoading: false, isError: false }),
}));

const cancelRequest = vi.fn();

function renderPanel(send: ChatSend) {
  return render(
    <MemoryRouter>
      <ChatProvider send={send} cancelRequest={cancelRequest}>
        <ChatPanel />
      </ChatProvider>
    </MemoryRouter>
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
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("reveals the header and transcript once a turn exists", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await user.type(composer(), "who is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByRole("button", { name: "Clear" })).toBeInTheDocument();
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

  it("replaces the card when a second question lands, leaving the earlier turn as text", async () => {
    const user = userEvent.setup();
    const send = vi
      .fn<ChatSend>()
      .mockResolvedValueOnce(
        answer(
          "Mara Vale is the only one.",
          listAction("list_entities", { entity_type: "actor", filter: "mar" }, {
            items: [{ id: "a-2", name: "Mara Vale", clicks: 88 }],
            next_cursor: null,
          })
        )
      )
      .mockResolvedValueOnce(
        answer(
          "One record matches.",
          listAction("search_records", { filter: "nig" }, {
            items: [{ id: "rec-1", name: "Nightjar Sessions", actors: [], views: 12 }],
            next_cursor: null,
          })
        )
      );
    renderPanel(send);

    await user.type(composer(), "actors starting with mar");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Mara Vale")).toBeInTheDocument();

    await user.type(composer(), "records starting with nig");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Nightjar Sessions")).toBeInTheDocument();
    expect(screen.queryByText("Mara Vale")).not.toBeInTheDocument();
    expect(screen.getByText("Mara Vale is the only one.")).toBeInTheDocument();
  });

  it("takes a record card back to the list it came out of", async () => {
    const user = userEvent.setup();
    const send = vi
      .fn<ChatSend>()
      .mockResolvedValueOnce(
        answer(
          "One record matches.",
          listAction("search_records", { filter: "nig" }, {
            items: [{ id: "rec-1", name: "Nightjar Sessions", actors: [], views: 12 }],
            next_cursor: null,
          })
        )
      )
      .mockResolvedValueOnce(
        answer(
          "Here it is.",
          singleAction("get_record", { id: "rec-1" }, {
            id: "rec-1",
            name: "Nightjar Sessions",
            views: 12,
            actors: [],
          })
        )
      );
    renderPanel(send);

    await user.type(composer(), "records starting with nig");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Records starting with 'nig'")).toBeInTheDocument();

    await user.type(composer(), "show me the first one");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Action · Record")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to list" }));

    expect(screen.getByText("Records starting with 'nig'")).toBeInTheDocument();
    expect(screen.queryByText("Action · Record")).not.toBeInTheDocument();
  });

  it("offers no way back when the action before the record was not a list", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>().mockResolvedValue(
      answer(
        "Here it is.",
        singleAction("get_record", { id: "rec-1" }, {
          id: "rec-1",
          name: "Nightjar Sessions",
          views: 12,
          actors: [],
        })
      )
    );
    renderPanel(send);

    await user.type(composer(), "show me rec-1");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Action · Record")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back to list" })).not.toBeInTheDocument();
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
