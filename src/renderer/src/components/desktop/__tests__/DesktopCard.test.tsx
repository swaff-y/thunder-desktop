import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DesktopCard from "../DesktopCard";
import { CartProvider } from "../../../hooks/useCart";
import type { ContentRecord } from "../../../types";

const fetchEntity = vi.fn();

vi.mock("../../../api/halo", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
}));

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

const record: ContentRecord = {
  id: "r-1",
  name: "Harbour Chase",
  actors: [{ id: "a1", name: "Anna" }],
  tags: [],
  images: [],
};

function renderCard(card: ContentRecord = record) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CartProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<DesktopCard record={card} />} />
            <Route path="/watch/:id" element={<div>watch page</div>} />
          </Routes>
        </MemoryRouter>
      </CartProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  fetchEntity.mockReset();
  fetchEntity.mockImplementation(async (type: string) =>
    type === "franchise"
      ? { id: "f-1", name: "Harbour Saga", status: "processing", url: null }
      : {
          id: "a1",
          name: "Anna",
          gender: "female",
          nationality: { code: "AU", displayName: "Australian" },
        }
  );
});

afterEach(() => {
  sessionStorage.clear();
});

describe("DesktopCard nationality flags", () => {
  it("shows the flag of a female actor's nationality", async () => {
    renderCard();

    expect(await screen.findByRole("img", { name: "Australian: Anna" })).toBeInTheDocument();
  });

  it("opens the record when the flag is clicked", async () => {
    renderCard();

    await userEvent.click(await screen.findByRole("img", { name: "Australian: Anna" }));

    expect(screen.getByText("watch page")).toBeInTheDocument();
  });

  it("toggles the queue button without opening the record", async () => {
    renderCard();

    await userEvent.click(screen.getByTitle("Add to queue"));

    expect(screen.getByTitle("Remove from queue")).toBeInTheDocument();
    expect(screen.queryByText("watch page")).not.toBeInTheDocument();
  });

  it("renders a record whose actors are null without reading an entity", () => {
    const legacy = { ...record, actors: null as unknown as ContentRecord["actors"] };

    renderCard(legacy);

    expect(screen.getByText("Harbour Chase")).toBeInTheDocument();
    expect(fetchEntity).not.toHaveBeenCalled();
  });
});

describe("DesktopCard franchise chip", () => {
  const franchised = { ...record, franchise: { id: "f-1", name: "Harbour Saga" } };

  it("shows the franchise in the footer in place of the series name", () => {
    renderCard({ ...franchised, series: { id: "s-1", name: "Night Shift" } });

    expect(screen.getByRole("link", { name: "Franchise: Harbour Saga" })).toHaveAttribute(
      "href",
      "/franchises/f-1"
    );
    expect(screen.queryByText("Night Shift")).not.toBeInTheDocument();
  });

  it("keeps the queue button clickable beside the chip", async () => {
    renderCard(franchised);

    await userEvent.click(screen.getByTitle("Add to queue"));

    expect(screen.getByTitle("Remove from queue")).toBeInTheDocument();
    expect(screen.queryByText("watch page")).not.toBeInTheDocument();
  });

  it("leaves the series name and reads no franchise when the record has none", () => {
    renderCard({ ...record, franchise: null, series: { id: "s-1", name: "Night Shift" } });

    expect(screen.getByText("Night Shift")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Franchise:/ })).not.toBeInTheDocument();
    expect(fetchEntity).not.toHaveBeenCalledWith("franchise", expect.anything());
  });
});
