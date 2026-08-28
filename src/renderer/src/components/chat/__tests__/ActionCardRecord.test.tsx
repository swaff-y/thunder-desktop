import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ChatAction } from "@swaff-y/thunder-chat-core";
import type { ContentRecord, EntityDetail } from "../../../types";
import ActionCardRecord from "../ActionCardRecord";
import { singleAction } from "./fixtures";

type Query<T> = { data: T | undefined; isLoading: boolean; isError: boolean };

const IDLE = { data: undefined, isLoading: false, isError: false };

let recordQuery: Query<ContentRecord> = IDLE;
let entityQuery: Query<EntityDetail> = IDLE;

vi.mock("../../../hooks/useRecord", () => ({
  useRecord: () => recordQuery,
}));

vi.mock("../../../hooks/useEntity", () => ({
  useEntity: () => entityQuery,
}));

/** Four slots as Halo answers them — no `url` unless the slot processed. */
function slots(statuses: ContentRecord["images"][number]["status"][]) {
  return statuses.map((status, index) => ({
    imageKey: `rec-1_${index}`,
    status,
    url: status === "processed" ? `https://fresh.test/${index}.jpg` : "",
  }));
}

function fetchedRecord(images: ContentRecord["images"]): ContentRecord {
  return { id: "rec-1", name: "Nightjar Sessions", actors: [], tags: [], images };
}

/** The dot the carousel marks as current, by its accessible name. */
function currentSlot(): string | null {
  const dots = screen.getAllByRole("button", { name: /^Image \d of \d/ });
  return dots.find((dot) => dot.getAttribute("aria-current") === "true")?.textContent ?? null;
}

function renderCard(action: ChatAction) {
  return render(
    <MemoryRouter>
      <ActionCardRecord action={action} />
    </MemoryRouter>
  );
}

function recordAction(overrides: Record<string, unknown> = {}): ChatAction {
  return singleAction(
    "get_record",
    { id: "rec-1" },
    {
      id: "rec-1",
      name: "Nightjar Sessions",
      views: 1204,
      likes: 12,
      actors: [
        { id: "a-1", name: "Jane Doe" },
        { id: "a-2", name: "Mara Vale" },
      ],
      tags: [{ id: "t-1", name: "Coastal" }],
      series: { id: "s-1", name: "Low Tide" },
      movie: { id: "m-1", name: "Salt" },
      franchise: { id: "f-1", name: "Tidewater" },
      ...overrides,
    }
  );
}

describe("ActionCardRecord", () => {
  beforeEach(() => {
    recordQuery = IDLE;
    entityQuery = IDLE;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("draws a record's four slots, its cast and its view count", () => {
    recordQuery = {
      data: fetchedRecord(slots(["processed", "processed", "processed", "processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction());

    expect(screen.getByText("Action · Record")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nightjar Sessions" })).toBeInTheDocument();
    expect(screen.getByText("rec-1")).toBeInTheDocument();
    expect(screen.getByText("Views")).toBeInTheDocument();
    expect(screen.getByText("1,204")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Image \d of 4$/ })).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Actors (2)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jane Doe" })).toHaveAttribute("href", "/actors/a-1");
    expect(screen.getByRole("link", { name: "Mara Vale" })).toHaveAttribute("href", "/actors/a-2");
  });

  it("leaves a chip unlinked when its ref carried no id", () => {
    recordQuery = {
      data: fetchedRecord(slots(["processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction({ actors: [{ name: "Jane Doe" }] }));

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Jane Doe" })).not.toBeInTheDocument();
  });

  it("draws a record's tags, its associations and its likes", () => {
    recordQuery = {
      data: fetchedRecord(slots(["processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction());

    expect(screen.getByText("Likes")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tags (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Coastal" })).toHaveAttribute("href", "/tags/t-1");
    expect(screen.getByRole("link", { name: "Low Tide" })).toHaveAttribute("href", "/series/s-1");
    expect(screen.getByRole("link", { name: "Salt" })).toHaveAttribute("href", "/movies/m-1");
    expect(screen.getByText("Tidewater")).toBeInTheDocument();
  });

  it("leaves out an association the record does not have", () => {
    recordQuery = {
      data: fetchedRecord(slots(["processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction({ series: undefined, movie: undefined, franchise: undefined, tags: [] }));

    expect(screen.queryByText("Series")).not.toBeInTheDocument();
    expect(screen.queryByText("Movie")).not.toBeInTheDocument();
    expect(screen.queryByText("Franchise")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Tags/ })).not.toBeInTheDocument();
  });

  it("keeps a dot for an unprocessed slot and labels it", () => {
    recordQuery = {
      data: fetchedRecord(slots(["processed", "failed", "processing", "processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction());

    expect(screen.getAllByRole("button", { name: /^Image \d of 4/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Image 2 of 4: Failed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Image 3 of 4: Processing" })).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("draws only the fetched URL, never one that rode in on the action", () => {
    recordQuery = {
      data: fetchedRecord(slots(["processed"])),
      isLoading: false,
      isError: false,
    };
    const { container } = renderCard(
      recordAction({
        images: [{ imageKey: "rec-1_0", status: "processed", url: "https://stale.test/expired.jpg" }],
      })
    );

    const sources = [...container.querySelectorAll("img")].map((img) => img.src);
    expect(sources).toEqual(["https://fresh.test/0.jpg"]);
  });

  it("falls back to a placeholder when the images cannot be fetched", () => {
    recordQuery = { data: undefined, isLoading: false, isError: true };
    renderCard(recordAction());

    expect(screen.getByText("Image unavailable")).toBeInTheDocument();
  });

  it("moves between slots on next, previous and the dots", async () => {
    const user = userEvent.setup();
    recordQuery = {
      data: fetchedRecord(slots(["processed", "processed", "processed", "processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction());

    expect(currentSlot()).toBe("Image 1 of 4");

    await user.click(screen.getByRole("button", { name: "Next image" }));
    expect(currentSlot()).toBe("Image 2 of 4");

    await user.click(screen.getByRole("button", { name: "Previous image" }));
    expect(currentSlot()).toBe("Image 1 of 4");

    await user.click(screen.getByRole("button", { name: "Image 4 of 4" }));
    expect(currentSlot()).toBe("Image 4 of 4");
  });

  it("never advances the carousel on its own", () => {
    vi.useFakeTimers();
    recordQuery = {
      data: fetchedRecord(slots(["processed", "processed", "processed", "processed"])),
      isLoading: false,
      isError: false,
    };
    renderCard(recordAction());

    act(() => vi.advanceTimersByTime(10_000));

    expect(currentSlot()).toBe("Image 1 of 4");
  });

  it("copies the id to the clipboard", async () => {
    const user = userEvent.setup();
    renderCard(recordAction());

    await user.click(screen.getByRole("button", { name: "Copy ID" }));

    await expect(navigator.clipboard.readText()).resolves.toBe("rec-1");
    expect(screen.getByRole("status")).toHaveTextContent("ID copied");
  });

  it("opens the record in the catalogue", async () => {
    const user = userEvent.setup();
    function Location() {
      return <p>at {useLocation().pathname}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Location />
        <Routes>
          <Route path="/" element={<ActionCardRecord action={recordAction()} />} />
          <Route path="/watch/:id" element={null} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("link", { name: "Open in catalogue" }));

    expect(screen.getByText("at /watch/rec-1")).toBeInTheDocument();
  });

  it("draws an actor with one image, a Clicks metric and no cast", () => {
    entityQuery = {
      data: {
        id: "a-1",
        name: "Marcus Vane",
        status: "processed",
        url: "https://fresh.test/actor.jpg",
        clicks: 42,
      },
      isLoading: false,
      isError: false,
    };
    const { container } = renderCard(
      singleAction(
        "get_entity",
        { entity_type: "actor", id: "a-1" },
        { id: "a-1", name: "Marcus Vane", clicks: 42 }
      )
    );

    expect(screen.getByText("Action · Actor")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("Clicks")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Actors/ })).not.toBeInTheDocument();
  });

  it("renders an image row's absent clicks as an em dash, not a zero", () => {
    entityQuery = {
      data: { id: "img-1", name: "Cover art", status: "processed", url: "https://fresh.test/i.jpg" },
      isLoading: false,
      isError: false,
    };
    renderCard(
      singleAction("get_entity", { entity_type: "image", id: "img-1" }, { id: "img-1", name: "Cover art" })
    );

    expect(screen.getByText("Clicks")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("gives a franchise neither a picture nor a metric", () => {
    const { container } = renderCard(
      singleAction(
        "get_entity",
        { entity_type: "franchise", id: "f-1" },
        { id: "f-1", name: "Tidewater" }
      )
    );

    expect(screen.getByRole("heading", { name: "Tidewater" })).toBeInTheDocument();
    expect(container.querySelector(".image-carousel")).toBeNull();
    expect(container.querySelector(".carousel-placeholder")).toBeNull();
    expect(screen.queryByText("Clicks")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("offers a way back when the turn before it was a list", async () => {
    const user = userEvent.setup();
    const onBackToList = vi.fn();
    render(
      <MemoryRouter>
        <ActionCardRecord action={recordAction()} onBackToList={onBackToList} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Back to list" }));

    expect(onBackToList).toHaveBeenCalledOnce();
  });

  it("renders nothing for an action that is not a single-record tool", () => {
    const { container } = renderCard(singleAction("search_records", {}, { items: [] }));

    expect(container.querySelector(".card-single")).toBeNull();
  });
});

describe("ActionCardRecord: Expand", () => {
  it("offers no Expand without a handler to expand into", () => {
    renderCard(recordAction());
    expect(screen.queryByRole("button", { name: "Expand" })).not.toBeInTheDocument();
  });

  it("calls the handler when Expand is clicked", async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(
      <MemoryRouter>
        <ActionCardRecord action={recordAction()} onExpand={onExpand} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Expand" }));

    expect(onExpand).toHaveBeenCalled();
  });
});
