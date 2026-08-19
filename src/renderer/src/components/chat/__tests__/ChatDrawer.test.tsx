import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { ChatProvider, type ChatSend } from "@swaff-y/thunder-chat-core";
import ChatDrawer from "../ChatDrawer";
import { answer } from "./fixtures";

vi.mock("../../../api/auth", () => ({
  reauthenticate: vi.fn(async () => ({ token: "t", apiKey: "k" })),
}));

vi.mock("../useActionImages", () => ({
  useActionImages: () => ({ slides: [], isLoading: false, isError: false }),
}));

/** The drawer as the app wires it: a trigger that owns the open state. */
function DrawerHost({ send }: { send: ChatSend }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <MemoryRouter>
      <ChatProvider send={send}>
        <button type="button" onClick={() => setOpen(true)}>
          Ask catalogue
        </button>
        <ChatDrawer open={open} onClose={() => setOpen(false)} />
      </ChatProvider>
    </MemoryRouter>
  );
}

function renderDrawer(send: ChatSend = vi.fn(async () => answer("unused"))) {
  return render(<DrawerHost send={send} />);
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: "Ask catalogue" });
}

function drawer(): HTMLElement {
  return screen.getByRole("dialog", { name: "Catalogue chat" });
}

/** The answer also lands in the panel's visually hidden live region. */
function transcript() {
  return within(screen.getByRole("list"));
}

function scrim(container: HTMLElement): Element {
  const element = container.querySelector(".chat-drawer-scrim");
  if (!element) throw new Error("no scrim rendered");
  return element;
}

describe("ChatDrawer", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("stays closed until the trigger is clicked", async () => {
    const user = userEvent.setup();
    renderDrawer();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(trigger());

    expect(drawer()).toHaveAttribute("aria-modal", "true");
  });

  it("closes on the Close button", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on a scrim click", async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();

    await user.click(trigger());
    await user.click(scrim(container));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(trigger());
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("swaps the panel width between Widen and Narrow, and starts narrow again on reopen", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(trigger());
    expect(drawer()).not.toHaveClass("chat-drawer--wide");

    await user.click(screen.getByRole("button", { name: "Widen" }));
    expect(drawer()).toHaveClass("chat-drawer--wide");

    await user.click(screen.getByRole("button", { name: "Narrow" }));
    expect(drawer()).not.toHaveClass("chat-drawer--wide");

    await user.click(screen.getByRole("button", { name: "Widen" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(trigger());

    expect(drawer()).not.toHaveClass("chat-drawer--wide");
  });

  it("takes focus to the composer on open and back to the trigger on close", async () => {
    const user = userEvent.setup();
    renderDrawer(vi.fn(async () => answer("Nick Cage")));

    trigger().focus();
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Ask the catalogue")).toHaveFocus();

    await user.keyboard("who is popular?{Enter}");
    expect(await transcript().findByText("Nick Cage")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(trigger()).toHaveFocus();
  });

  it("wraps Tab inside the dialog rather than letting it walk out", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(trigger());
    const widen = screen.getByRole("button", { name: "Widen" });
    const composer = screen.getByLabelText("Ask the catalogue");

    // Composer last, Ask disabled: forward off the end lands on Widen again.
    composer.focus();
    await user.tab();
    expect(widen).toHaveFocus();

    await user.tab({ shift: true });
    expect(composer).toHaveFocus();
  });

  it("keeps the conversation when it is reopened", async () => {
    const user = userEvent.setup();
    renderDrawer(vi.fn(async () => answer("Nick Cage")));

    await user.click(trigger());
    await user.type(screen.getByLabelText("Ask the catalogue"), "who is popular?{Enter}");
    expect(await transcript().findByText("Nick Cage")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(trigger());

    expect(transcript().getByText("who is popular?")).toBeInTheDocument();
    expect(transcript().getByText("Nick Cage")).toBeInTheDocument();
  });
});
