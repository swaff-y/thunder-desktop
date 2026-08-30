/**
 * TD-069: one action filling the drawer.
 *
 * The overlay is not a second design for an action — it is the same action
 * with room — so most of what is asserted here is that it says the same
 * things the inline card does, over more of the page.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ChatAction } from "@swaff-y/thunder-chat-core";
import ActionOverlay from "../ActionOverlay";
import type { ActionImages } from "../useActionImages";
import { listAction, singleAction } from "./fixtures";

let images: ActionImages = { slides: [], isLoading: false, isError: false };

vi.mock("../useActionImages", () => ({
  useActionImages: () => images,
}));

const RECORDS = [
  { id: "rec-1", name: "Nightjar Sessions", actors: [{ name: "Mara Vale" }], views: 1204 },
  { id: "rec-2", name: "Nightfall", actors: [], views: 900 },
  { id: "rec-3", name: "Night Shift", actors: [], views: 800 },
];

function recordsAction(items = RECORDS): ChatAction {
  return listAction("search_records", { filter: "nig" }, { items, next_cursor: null });
}

function recordAction(): ChatAction {
  return singleAction(
    "get_record",
    { id: "rec-1" },
    {
      id: "rec-1",
      name: "Nightjar Sessions",
      views: 1204,
      actors: [{ id: "a-1", name: "Mara Vale" }],
      tags: [],
      images: [],
    }
  );
}

function renderOverlay(action: ChatAction, props: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <ActionOverlay action={action} onClose={vi.fn()} {...props} />
    </MemoryRouter>
  );
}

function overlay(): HTMLElement {
  return screen.getByRole("dialog");
}

/** The carousel slide the dots mark as current, by its accessible name. */
function currentSlide(): string | null {
  const dots = screen.getAllByRole("button", { name: /^Image \d of \d$/ });
  return dots.find((dot) => dot.getAttribute("aria-current") === "true")?.textContent ?? null;
}

beforeEach(() => {
  images = { slides: [], isLoading: false, isError: false };
});

describe("ActionOverlay: a list", () => {
  it("draws the wide table over the rows the card was given", () => {
    renderOverlay(recordsAction());

    expect(screen.getByRole("columnheader", { name: "Image" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actors" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Views" })).toBeInTheDocument();
    // The header row plus one row per record — no six-row cap of its own.
    expect(screen.getAllByRole("row")).toHaveLength(RECORDS.length + 1);
    expect(screen.getByText("Nightjar Sessions")).toBeInTheDocument();
    expect(screen.getByText("Night Shift")).toBeInTheDocument();
    expect(screen.getByText("Mara Vale")).toBeInTheDocument();
    expect(screen.getByText("1,204")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View record: Nightjar Sessions" })
    ).toBeInTheDocument();
  });

  // The reason `Expand` exists: the inline card takes the adapter's six-row
  // default, and this is the view that asked for the rest of the page.
  it("draws every row of the page, past the six the inline card stops at", () => {
    const page = Array.from({ length: 8 }, (_, index) => ({
      id: `rec-${index + 1}`,
      name: `Night ${index + 1}`,
      actors: [],
      views: (index + 1) * 10,
    }));
    renderOverlay(recordsAction(page));

    expect(screen.getAllByRole("row")).toHaveLength(page.length + 1);
    expect(screen.getByText("Night 7")).toBeInTheDocument();
    expect(screen.getByText("Night 8")).toBeInTheDocument();
    expect(screen.getByText("8 results")).toBeInTheDocument();
  });

  it("keeps the count line", () => {
    renderOverlay(recordsAction());
    expect(screen.getByText("3 results")).toBeInTheDocument();
  });

  it("heads itself with the same kind, title and tool as the card", () => {
    renderOverlay(recordsAction());

    expect(screen.getByText("Action · list")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Records starting with 'nig'" })).toBeInTheDocument();
    expect(screen.getByText("search_records")).toBeInTheDocument();
  });

  it("says so rather than drawing an empty table when the page is empty", () => {
    renderOverlay(recordsAction([]));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("ActionOverlay: a record", () => {
  beforeEach(() => {
    images = {
      slides: [
        { url: "https://fresh.test/0.jpg", imageKey: "rec-1_0" },
        { url: "https://fresh.test/1.jpg", imageKey: "rec-1_1" },
        { url: "https://fresh.test/2.jpg", imageKey: "rec-1_2" },
      ],
      isLoading: false,
      isError: false,
    };
  });

  it("draws a thumbnail rail beside the carousel, one per slot", () => {
    renderOverlay(recordAction());

    const rail = within(screen.getByRole("list", { name: "Image slots" }));
    expect(rail.getAllByRole("button")).toHaveLength(3);
  });

  it("moves the carousel to the slot whose thumbnail was clicked", async () => {
    const user = userEvent.setup();
    renderOverlay(recordAction());

    expect(currentSlide()).toBe("Image 1 of 3");

    const rail = within(screen.getByRole("list", { name: "Image slots" }));
    await user.click(rail.getAllByRole("button")[2]);

    expect(currentSlide()).toBe("Image 3 of 3");
    expect(rail.getAllByRole("button")[2]).toHaveAttribute("aria-current", "true");
  });

  it("draws the record's name, id, actions and cast as the card does", () => {
    renderOverlay(recordAction());

    expect(screen.getByRole("heading", { name: "Nightjar Sessions" })).toBeInTheDocument();
    expect(screen.getByText("rec-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in catalogue" })).toBeInTheDocument();
    expect(screen.getByText("Mara Vale")).toBeInTheDocument();
  });

  it("goes back to the list it came out of", async () => {
    const user = userEvent.setup();
    renderOverlay(recordAction(), { previousList: recordsAction() });

    await user.click(screen.getByRole("button", { name: "Back to list" }));

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Action · list")).toBeInTheDocument();
  });

  // The click unmounts the button that was clicked, so focus has to be put
  // somewhere rather than left to fall back to the document body.
  it("keeps focus inside itself across the way back", async () => {
    const user = userEvent.setup();
    renderOverlay(recordAction(), { previousList: recordsAction() });

    await user.click(screen.getByRole("button", { name: "Back to list" }));

    expect(overlay()).toHaveFocus();
  });

  it("offers no way back when the record did not come out of a list", () => {
    renderOverlay(recordAction());
    expect(screen.queryByRole("button", { name: "Back to list" })).not.toBeInTheDocument();
  });
});

describe("ActionOverlay: closing", () => {
  it("closes on Close", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderOverlay(recordsAction(), { onClose });

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  // The drawer listens for Escape on `document`. If the overlay let the
  // event past, the first Escape would close the drawer as well.
  it("closes on Escape without letting the key reach the drawer", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const outside = vi.fn();
    document.addEventListener("keydown", outside);
    renderOverlay(recordsAction(), { onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
    expect(outside).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outside);
  });

  it("takes focus on open so Escape has somewhere to land", () => {
    renderOverlay(recordsAction());
    expect(overlay()).toHaveFocus();
  });
});
