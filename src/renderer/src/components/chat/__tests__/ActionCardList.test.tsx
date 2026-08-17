import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ChatAction } from "../../../../../shared/chat";
import ActionCardList from "../ActionCardList";
import { listAction } from "./fixtures";

function renderCard(action: ChatAction) {
  return render(
    <MemoryRouter>
      <ActionCardList action={action} />
    </MemoryRouter>
  );
}

describe("ActionCardList", () => {
  it("heads the card with the kind, the filtered title and the tool name", () => {
    renderCard(
      listAction("list_entities", { entity_type: "actor", filter: "mar" }, {
        items: [{ id: "a-2", name: "Mara Vale", clicks: 88 }],
        next_cursor: null,
      })
    );

    expect(screen.getByText("Action · list")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Actors starting with 'mar'" })).toBeInTheDocument();
    expect(screen.getByText("list_entities")).toBeInTheDocument();
    expect(screen.getByText("Clicks")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
  });

  it("navigates to the record when its CTA is clicked", async () => {
    const user = userEvent.setup();
    function Location() {
      return <p>at {useLocation().pathname}</p>;
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Location />
        <Routes>
          <Route
            path="/"
            element={
              <ActionCardList
                action={listAction("search_records", { filter: "nig" }, {
                  items: [{ id: "rec-1", name: "Nightjar Sessions", actors: [], views: 12 }],
                  next_cursor: null,
                })}
              />
            }
          />
          <Route path="/watch/:id" element={null} />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("link", { name: "View record: Nightjar Sessions" }));

    expect(screen.getByText("at /watch/rec-1")).toBeInTheDocument();
  });

  it("names each CTA with the item it opens", () => {
    renderCard(
      listAction("search_records", { filter: "nig" }, {
        items: [
          { id: "rec-1", name: "Nightjar Sessions", actors: [{ id: "a-1", name: "Jane Doe" }], views: 12 },
        ],
        next_cursor: null,
      })
    );

    const cta = screen.getByRole("link", { name: "View record: Nightjar Sessions" });
    expect(cta).toHaveAttribute("href", "/watch/rec-1");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders an em dash rather than zero when the type carries no clicks", () => {
    renderCard(
      listAction("list_entities", { entity_type: "franchise" }, {
        items: [{ id: "f-1", name: "Tidewater" }],
        next_cursor: null,
      })
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says nothing starts with the filter when it matched nothing", () => {
    renderCard(listAction("search_records", { filter: "zzz" }, { items: [], next_cursor: null }));

    expect(screen.getByText("Nothing starts with 'zzz'.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("notes that a ranking is all time", () => {
    renderCard(
      listAction("get_top_entities", { entity_type: "record" }, {
        entity_type: "record",
        event_type: "view",
        items: [{ entity_id: "rec-1", name: "Nightjar Sessions", count: 900 }],
      })
    );

    expect(screen.getByText("Views")).toBeInTheDocument();
    expect(screen.getByText("all time")).toBeInTheDocument();
  });

  it("says more is available without ever showing the cursor", () => {
    const items = [{ id: "a-1", name: "Jane Doe", clicks: 3 }];
    const { container, rerender } = renderCard(
      listAction("list_entities", { entity_type: "actor" }, { items, next_cursor: "opaque-cursor" })
    );

    expect(screen.getByText("more available")).toBeInTheDocument();
    expect(container.textContent).not.toContain("opaque-cursor");

    rerender(
      <MemoryRouter>
        <ActionCardList
          action={listAction("list_entities", { entity_type: "actor" }, { items, next_cursor: null })}
        />
      </MemoryRouter>
    );

    expect(screen.queryByText("more available")).not.toBeInTheDocument();
  });

  it("counts the page and says how much of it is shown", () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      id: `a-${index}`,
      name: `Actor ${index}`,
      clicks: index,
    }));

    renderCard(listAction("list_entities", { entity_type: "actor" }, { items }));

    expect(screen.getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Showing 6 of 9")).toBeInTheDocument();
  });

  it("renders nothing for a tool with no list mapping", () => {
    const { container } = renderCard(listAction("get_record", { id: "rec-1" }, { id: "rec-1" }));

    expect(container).toBeEmptyDOMElement();
  });
});
