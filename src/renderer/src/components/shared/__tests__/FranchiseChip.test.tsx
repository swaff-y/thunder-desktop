import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FranchiseChip from "../FranchiseChip";

const fetchEntity = vi.fn();
const trackEntityClick = vi.fn();

vi.mock("../../../api/halo", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
  trackEntityClick: (...args: unknown[]) => trackEntityClick(...args),
}));

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

const franchise = { id: "f-1", name: "Harbour Saga" };

function renderChip() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<FranchiseChip franchise={franchise} />} />
          <Route path="/franchises/:id" element={<div>franchise page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...view, client };
}

beforeEach(() => {
  fetchEntity.mockReset();
  trackEntityClick.mockReset();
});

describe("FranchiseChip", () => {
  it("shows the name at once and the avatar once the franchise resolves", async () => {
    fetchEntity.mockResolvedValue({
      id: "f-1",
      name: "Harbour Saga",
      status: "processed",
      url: "https://cdn.test/f-1.jpg",
      imageKey: "f-1",
      imageVersion: 3,
    });

    const { container } = renderChip();

    expect(screen.getByText("Harbour Saga")).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.test/f-1.jpg")
    );
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    expect(fetchEntity).toHaveBeenCalledWith("franchise", "f-1");
  });

  it("shows the initial in the same sized avatar while the url is null", async () => {
    fetchEntity.mockResolvedValue({ id: "f-1", name: "Harbour Saga", status: "processing", url: null });

    const { container, client } = renderChip();

    await vi.waitFor(() =>
      expect(client.getQueryState(["entity", "franchise", "f-1"])?.status).toBe("success")
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".franchise-chip-avatar")).toHaveTextContent("H");
    expect(screen.getByRole("link", { name: "Franchise: Harbour Saga" })).toBeInTheDocument();
  });

  it("links to the franchise page with an accessible name", () => {
    fetchEntity.mockReturnValue(new Promise(() => {}));

    renderChip();

    expect(screen.getByRole("link", { name: "Franchise: Harbour Saga" })).toHaveAttribute(
      "href",
      "/franchises/f-1"
    );
  });

  it("opens the franchise page without tracking a click", async () => {
    fetchEntity.mockReturnValue(new Promise(() => {}));

    renderChip();
    await userEvent.click(screen.getByRole("link", { name: "Franchise: Harbour Saga" }));

    expect(screen.getByText("franchise page")).toBeInTheDocument();
    expect(trackEntityClick).not.toHaveBeenCalled();
  });
});
