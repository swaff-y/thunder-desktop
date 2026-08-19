import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatProvider, type ChatSend } from "@swaff-y/thunder-chat-core";
import Home from "../../../pages/Home";
import ChatDrawer from "../ChatDrawer";
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

const closeDrawer = vi.fn();

function renderHomeWithDrawer(send: ChatSend) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatProvider send={send}>
        <Home />
        <ChatDrawer open onClose={closeDrawer} />
      </ChatProvider>
    </QueryClientProvider>
  );
}

async function askAQuestion(): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Ask the catalogue"), "who is popular?");
  await user.click(screen.getByRole("button", { name: "Ask" }));
}

/** The answer also lands in the panel's visually hidden live region. */
function transcript() {
  return within(screen.getByRole("list"));
}

describe("Home behind the chat drawer", () => {
  beforeEach(() => {
    sessionStorage.clear();
    refetch.mockClear();
    closeDrawer.mockClear();
  });

  it("renders the carousel and the record list, and no chat panel of its own", async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Home />
      </QueryClientProvider>
    );

    expect(await screen.findByText("hero-carousel")).toBeInTheDocument();
    expect(screen.getByText("record-list")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask the catalogue")).not.toBeInTheDocument();
  });

  it("keeps the carousel and the record list once a turn resolves in the drawer", async () => {
    renderHomeWithDrawer(vi.fn(async () => answer("Nick Cage")));

    await screen.findByText("hero-carousel");
    await askAQuestion();

    await waitFor(() => expect(transcript().getByText("Nick Cage")).toBeInTheDocument());
    expect(screen.getByText("hero-carousel")).toBeInTheDocument();
    expect(screen.getByText("record-list")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Library" })).toBeInTheDocument();
    // Same records, not a fresh shuffle: nothing asked the query to refetch.
    expect(refetch).not.toHaveBeenCalled();
  });
});
