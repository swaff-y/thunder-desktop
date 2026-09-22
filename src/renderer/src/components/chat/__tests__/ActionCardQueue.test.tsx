/**
 * TD-090: the card proposes four records; the button replaces the watch
 * queue with them.
 *
 * The button is the only thing here that writes, and what it writes is
 * `useCart`, so that is what is spied on — the order of `clear` then `add`
 * is the whole point of the ticket.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ChatAction, QueueItem } from "@swaff-y/thunder-chat-core";
import ActionCardQueue from "../ActionCardQueue";
import type { ContentRecord } from "../../../types";
import { queueAction, singleAction } from "./fixtures";

const writes: string[] = [];
const add = vi.fn((record: ContentRecord) => {
  writes.push(`add:${record.id}`);
});
const clear = vi.fn(() => {
  writes.push("clear");
});

vi.mock("../../../hooks/useCart", () => ({
  useCart: () => ({
    items: [],
    add,
    clear,
    remove: vi.fn(),
    has: () => false,
    isFull: false,
    canWatch: false,
  }),
}));

vi.mock("../useActionImages", () => ({
  useActionImages: () => ({ slides: [], isLoading: false, isError: false }),
}));

const useRecord = vi.fn();
vi.mock("../../../hooks/useRecord", () => ({
  useRecord: (id: string) => useRecord(id),
}));

const fetchRecord = vi.fn();
vi.mock("../../../api/halo", () => ({
  fetchRecord: (id: string) => fetchRecord(id),
}));

const ITEMS: QueueItem[] = [
  { id: "rec-1", name: "Nightjar Sessions" },
  { id: "rec-2", name: "Nightfall" },
  { id: "rec-3", name: "Night Shift" },
  { id: "rec-4", name: "Nightwatch" },
];

function record(id: string, name: string): ContentRecord {
  return {
    id,
    name,
    actors: [{ id: `a-${id}`, name: "Mara Vale" }],
    tags: [],
    images: [],
  };
}

function renderCard(action: ChatAction) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActionCardQueue action={action} />
    </QueryClientProvider>
  );
}

/** The card has exactly one button, and its label changes while it is busy. */
function button(): HTMLElement {
  return screen.getByRole("button");
}

beforeEach(() => {
  writes.length = 0;
  add.mockClear();
  clear.mockClear();
  useRecord.mockReturnValue({ data: undefined });
  fetchRecord.mockImplementation((id: string) => Promise.resolve(record(id, `Fetched ${id}`)));
});

describe("ActionCardQueue", () => {
  it("draws a row per item, with its name", () => {
    renderCard(queueAction(ITEMS));

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    for (const item of ITEMS) {
      expect(screen.getByText(item.name as string)).toBeTruthy();
    }
  });

  it("says the button replaces what is queued", () => {
    renderCard(queueAction(ITEMS));

    expect(screen.getByText(/replaces/i)).toBeTruthy();
  });

  it("falls back to the re-read record's name, then to the id", () => {
    useRecord.mockImplementation((id: string) =>
      id === "rec-1" ? { data: record("rec-1", "Re-read name") } : { data: undefined }
    );

    renderCard(queueAction([{ id: "rec-1" }, { id: "rec-2" }]));

    expect(screen.getByText("Re-read name")).toBeTruthy();
    // Name and id, both the id — the row has nothing else to show.
    expect(screen.getAllByText("rec-2")).toHaveLength(2);
  });

  it("renders nothing for an action of another kind", () => {
    const { container } = renderCard(singleAction("get_record", {}, { id: "rec-1" }));

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the adapter refuses the action", () => {
    const { container } = renderCard(queueAction(undefined));

    expect(container.firstChild).toBeNull();
  });
});

describe("ActionCardQueue: the button", () => {
  it("clears first, then adds every item in card order", async () => {
    renderCard(queueAction(ITEMS));

    await userEvent.click(button());

    expect(writes).toEqual(["clear", "add:rec-1", "add:rec-2", "add:rec-3", "add:rec-4"]);
  });

  it("adds the records it fetched, not the ones the action carried", async () => {
    renderCard(queueAction(ITEMS));

    await userEvent.click(button());

    expect(add.mock.calls[0][0]).toEqual(record("rec-1", "Fetched rec-1"));
  });

  it("keeps a record whose fetch failed, with empty associations", async () => {
    fetchRecord.mockImplementation((id: string) =>
      id === "rec-2"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(record(id, `Fetched ${id}`))
    );

    renderCard(queueAction(ITEMS));

    await userEvent.click(button());

    expect(add).toHaveBeenCalledTimes(4);
    expect(add.mock.calls[1][0]).toEqual({
      id: "rec-2",
      name: "Nightfall",
      actors: [],
      tags: [],
      images: [],
    });
  });

  it("is disabled while the fetches are in flight, and acknowledges the count after", async () => {
    let release!: (value: ContentRecord) => void;
    fetchRecord.mockImplementation(
      (id: string) =>
        new Promise<ContentRecord>((resolve) => {
          if (id === "rec-1") release = resolve;
          else resolve(record(id, `Fetched ${id}`));
        })
    );

    renderCard(queueAction(ITEMS));
    await userEvent.click(button());

    expect(button().hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();

    release(record("rec-1", "Fetched rec-1"));

    expect((await screen.findByRole("status")).textContent).toContain("Queued 4 records");
    expect(button().hasAttribute("disabled")).toBe(false);
  });

  it("says MultiWatch needs two when only one landed", async () => {
    renderCard(queueAction([{ id: "rec-1", name: "Nightjar Sessions" }]));

    await userEvent.click(button());

    expect((await screen.findByRole("status")).textContent).toContain("MultiWatch needs two");
  });

  it("comes back live and unacknowledged on remount", async () => {
    const view = renderCard(queueAction(ITEMS));
    await userEvent.click(button());
    await screen.findByRole("status");

    view.unmount();
    renderCard(queueAction(ITEMS));

    expect(screen.queryByRole("status")).toBeNull();
    expect(button().hasAttribute("disabled")).toBe(false);
  });
});
