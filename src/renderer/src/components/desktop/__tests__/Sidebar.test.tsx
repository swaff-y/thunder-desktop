/**
 * TD-096: the nav is a hand-written list sitting beside the `CATEGORIES`
 * table, so the thing worth asserting is the order the two agree on — a
 * category added to one and not the other is invisible until it is clicked.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { TabHistoryProvider } from "../../../hooks/useTabHistory";
import Sidebar from "../Sidebar";

function Location() {
  return <p>at {useLocation().pathname}</p>;
}

function renderSidebar(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TabHistoryProvider>
        <Location />
        <Sidebar />
      </TabHistoryProvider>
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("lists every destination in order", () => {
    renderSidebar();

    const labels = screen.getAllByRole("button").map((button) => button.textContent);

    expect(labels).toEqual([
      "Home",
      "Actors",
      "Series",
      "Movies",
      "Franchises",
      "Tags",
      "Browser",
      "Stats",
    ]);
  });

  it("navigates to the franchise list", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Franchises" }));

    expect(screen.getByText("at /franchises")).toBeInTheDocument();
  });

  it("renders the franchise link active while on a franchise page", () => {
    renderSidebar("/franchises/f-1");

    expect(screen.getByRole("button", { name: "Franchises" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Movies" })).not.toHaveClass("active");
  });

  it("resets to the list when Franchises is clicked from a franchise detail page", async () => {
    const user = userEvent.setup();
    renderSidebar("/franchises/f-1");

    await user.click(screen.getByRole("button", { name: "Franchises" }));

    expect(screen.getByText("at /franchises")).toBeInTheDocument();
  });

  it("returns to the franchise it was left on after a visit to another tab", async () => {
    const user = userEvent.setup();
    renderSidebar("/franchises/f-1");

    await user.click(screen.getByRole("button", { name: "Movies" }));
    expect(screen.getByText("at /movies")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Franchises" }));

    expect(screen.getByText("at /franchises/f-1")).toBeInTheDocument();
  });
});
