import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatProvider, type ChatSend } from "../../../hooks/useChat";
import Home from "../../../pages/Home";
import { answer } from "./fixtures";

const refetch = vi.fn();

vi.mock("../../../hooks/useRecords", () => ({
  useRandomRecords: () => ({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: null,
    isRefetching: false,
    refetch,
  }),
}));

vi.mock("../../desktop/HeroCarousel", () => ({
  default: () => <div>hero-carousel</div>,
}));

vi.mock("../../shared/VirtualRecordList", () => ({
  default: () => <div>record-list</div>,
}));

function stubSettings(chatEnabled: boolean): void {
  Object.assign(window.thunder, { settings: { get: vi.fn(async () => chatEnabled) } });
}

function renderHome(send: ChatSend) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatProvider send={send}>
        <Home />
      </ChatProvider>
    </QueryClientProvider>
  );
}

async function askAQuestion(): Promise<void> {
  const user = userEvent.setup();
  await screen.findByRole("region", { name: "Catalogue chat" });
  await user.type(screen.getByLabelText("Ask the catalogue"), "who is popular?");
  await user.click(screen.getByRole("button", { name: "Ask" }));
}

/** The answer also lands in the panel's visually hidden live region. */
function transcript() {
  return within(screen.getByRole("list"));
}

describe("Home chat shell", () => {
  beforeEach(() => {
    sessionStorage.clear();
    refetch.mockClear();
    stubSettings(true);
  });

  it("renders the chat panel above the carousel and the record list when the chat is empty", async () => {
    renderHome(vi.fn(async () => answer("unused")));

    expect(await screen.findByRole("region", { name: "Catalogue chat" })).toBeInTheDocument();
    expect(screen.getByText("hero-carousel")).toBeInTheDocument();
    expect(screen.getByText("record-list")).toBeInTheDocument();
  });

  it("renders neither the carousel nor the record list once a turn resolves", async () => {
    renderHome(vi.fn(async () => answer("Nick Cage")));

    await screen.findByText("hero-carousel");
    await askAQuestion();

    await waitFor(() => expect(transcript().getByText("Nick Cage")).toBeInTheDocument());
    expect(screen.queryByText("hero-carousel")).not.toBeInTheDocument();
    expect(screen.queryByText("record-list")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your Library" })).not.toBeInTheDocument();
  });

  it("restores the carousel and the record list when Clear is clicked", async () => {
    const user = userEvent.setup();
    renderHome(vi.fn(async () => answer("Nick Cage")));

    await screen.findByText("hero-carousel");
    await askAQuestion();
    await waitFor(() => expect(transcript().getByText("Nick Cage")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(await screen.findByText("hero-carousel")).toBeInTheDocument();
    expect(screen.getByText("record-list")).toBeInTheDocument();
    expect(screen.queryByText("Nick Cage")).not.toBeInTheDocument();
    // Same records, not a fresh shuffle: nothing asked the query to refetch.
    expect(refetch).not.toHaveBeenCalled();
  });

  it("renders no chat panel when chat is disabled in settings", async () => {
    stubSettings(false);
    renderHome(vi.fn(async () => answer("unused")));

    expect(await screen.findByText("hero-carousel")).toBeInTheDocument();
    expect(screen.getByText("record-list")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Catalogue chat" })).not.toBeInTheDocument();
  });
});
