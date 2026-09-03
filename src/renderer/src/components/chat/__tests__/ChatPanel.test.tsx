import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  ChatProvider,
  formatUsageSummary,
  type ChatSend,
  type ModelInfo,
  type TurnUsage,
} from "@swaff-y/thunder-chat-core";
import ChatPanel from "../ChatPanel";
import {
  answer,
  deferredAnswer,
  listAction,
  singleAction,
  TOM_HARDY_IMAGES,
  webImagesAction,
} from "./fixtures";

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

function composer(): HTMLTextAreaElement {
  return screen.getByLabelText("Ask the catalogue");
}

function saidLines(): string[] {
  return [...document.querySelectorAll(".chat-said")].map((said) => said.textContent ?? "");
}

/** Asks and waits for the turn to settle, which is when the composer comes back. */
async function askQuestion(
  user: ReturnType<typeof userEvent.setup>,
  question: string
): Promise<void> {
  await user.click(composer());
  await user.keyboard(question);
  await user.keyboard("{Enter}");
  await waitFor(() => expect(composer()).toBeEnabled());
}

describe("ChatPanel", () => {
  beforeEach(() => {
    sessionStorage.clear();
    reauthenticate.mockClear();
    cancelRequest.mockClear();
  });

  it("shows the header, an empty transcript and the composer with no conversation", () => {
    renderPanel(vi.fn(async () => answer("unused")));

    expect(composer()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });

  it("fills the transcript once a turn exists", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await user.type(composer(), "who is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await within(screen.getByRole("list")).findByText("Nick Cage")).toBeInTheDocument();
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

  it("draws the web images card rather than falling through to nothing", async () => {
    const user = userEvent.setup();
    const send = vi
      .fn<ChatSend>()
      .mockResolvedValue(answer("Here are five.", webImagesAction("gifs of Tom Hardy")));
    renderPanel(send);

    await user.type(composer(), "find me some gifs of Tom Hardy");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByRole("heading", { name: "Images from the web" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(TOM_HARDY_IMAGES.length);
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

/**
 * TD-072: the words are `formatUsageSummary`'s. These tests assert on what
 * the package renders, never on a string rebuilt here — a local copy of the
 * `~`, the "USD" or the decimals is the failure the ticket is guarding.
 */
describe("ChatPanel usage summary", () => {
  const MODEL: ModelInfo = {
    id: "deepseek.v3.2",
    input_price_per_mtok: 0.28,
    output_price_per_mtok: 0.42,
    currency: "USD",
  };

  const USAGE: TurnUsage = {
    model: MODEL.id,
    rounds: 1,
    input_tokens: 1200,
    output_tokens: 300,
    cache_read_input_tokens: 0,
    cache_write_input_tokens: 0,
    cost_usd: 0.004,
    conversation: { turns: 1, input_tokens: 1200, output_tokens: 300, cost_usd: 0.041 },
  };

  function line(): HTMLElement | null {
    return document.querySelector(".chat-usage");
  }

  async function askOnce(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(composer(), "what is popular?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(
      await within(screen.getByRole("list")).findByText("Nick Cage")
    ).toBeInTheDocument();
  }

  const reportingSend: ChatSend = async (_question, _history, _onStatus, lifecycle) => {
    lifecycle?.onUsage?.(USAGE);
    return answer("Nick Cage");
  };

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("says nothing before a turn has run", () => {
    renderPanel(vi.fn(async () => answer("unused")));

    expect(line()).toBeEmptyDOMElement();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders the package's own summary once a turn reports", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ChatProvider
          send={reportingSend}
          cancelRequest={cancelRequest}
          loadCapabilities={async () => ({ chat_enabled: true, tools: [], model: MODEL })}
        >
          <ChatPanel />
        </ChatProvider>
      </MemoryRouter>
    );

    await askOnce(user);

    const expected = formatUsageSummary(USAGE.conversation, MODEL);
    expect(expected).not.toBeNull();
    await waitFor(() => expect(line()).toHaveTextContent(String(expected)));
  });

  it("forgets what the last conversation cost when the chat is cleared", async () => {
    const user = userEvent.setup();
    renderPanel(reportingSend);

    await askOnce(user);
    await waitFor(() => expect(line()).not.toBeEmptyDOMElement());

    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => expect(line()).toBeEmptyDOMElement());
  });
});


/**
 * TD-074: the composer is a textarea, so none of Enter, the arrow keys or a
 * surviving draft come free from the browser — each is asserted here.
 */
describe("ChatPanel composer", () => {
  const DRAFT_STORAGE_KEY = "thunder_chat_draft";

  beforeEach(() => {
    sessionStorage.clear();
  });

  it("keeps the drawer's own height: a one-row textarea, not a growing input", () => {
    renderPanel(vi.fn(async () => answer("unused")));

    expect(composer().tagName).toBe("TEXTAREA");
    expect(composer()).toHaveAttribute("rows", "1");
  });

  it("makes a new line on Shift+Enter and sends the whole question on Enter", async () => {
    const user = userEvent.setup();
    const send = vi.fn<ChatSend>(async () => answer("Nick Cage"));
    renderPanel(send);

    await user.click(composer());
    await user.keyboard("who is popular?");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.keyboard("in 1999");

    expect(composer()).toHaveValue("who is popular?\nin 1999");
    expect(send).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0][0]).toBe("who is popular?\nin 1999");
  });

  it("keeps the line breaks of a sent question in the transcript", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await user.click(composer());
    await user.keyboard("who is popular?");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.keyboard("in 1999{Enter}");

    await waitFor(() => expect(saidLines()).toContain("who is popular?\nin 1999"));
  });

  it("walks back through the questions on Up and stops at the oldest", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await askQuestion(user, "first");
    await askQuestion(user, "second");
    await askQuestion(user, "third");

    await user.click(composer());
    await user.keyboard("{ArrowUp}");
    expect(composer()).toHaveValue("third");
    await user.keyboard("{ArrowUp}");
    expect(composer()).toHaveValue("second");
    await user.keyboard("{ArrowUp}");
    expect(composer()).toHaveValue("first");
    await user.keyboard("{ArrowUp}");
    expect(composer()).toHaveValue("first");
  });

  it("walks forward on Down and ends on what was typed before the first Up", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await askQuestion(user, "first");
    await askQuestion(user, "second");

    await user.click(composer());
    await user.keyboard("half typed");
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(composer()).toHaveValue("first");

    await user.keyboard("{ArrowDown}");
    expect(composer()).toHaveValue("second");
    await user.keyboard("{ArrowDown}");
    expect(composer()).toHaveValue("half typed");
    expect(composer().selectionStart).toBe("half typed".length);
  });

  it("starts the next recall from the newest question once the recalled one is edited", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await askQuestion(user, "first");
    await askQuestion(user, "second");

    await user.click(composer());
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(composer()).toHaveValue("first");

    await user.keyboard("!");
    expect(composer()).toHaveValue("first!");

    await user.keyboard("{ArrowUp}");
    expect(composer()).toHaveValue("second");
  });

  it("leaves the caret alone when Up is pressed below the first line", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await askQuestion(user, "first");

    await user.click(composer());
    await user.keyboard("top");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.keyboard("bottom");
    await user.keyboard("{ArrowUp}");

    expect(composer()).toHaveValue("top\nbottom");
  });

  it("gives a half-typed question back when the panel is mounted again", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel(vi.fn(async () => answer("unused")));

    await user.type(composer(), "half typed");
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBe("half typed");

    unmount();
    renderPanel(vi.fn(async () => answer("unused")));

    expect(composer()).toHaveValue("half typed");
    expect(composer().selectionStart).toBe("half typed".length);
  });

  it("empties the composer as well as the transcript on Clear", async () => {
    const user = userEvent.setup();
    renderPanel(vi.fn(async () => answer("Nick Cage")));

    await askQuestion(user, "who is popular?");
    await user.type(composer(), "half typed");

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(composer()).toHaveValue("");
    expect(sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBe("");
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });
});
