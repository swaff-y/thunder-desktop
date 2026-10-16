import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CategoryItem, PaginatedResponse } from "../../types";
import CategoryList from "../CategoryList";

const fetchCategoryItems = vi.fn();
const trackEntityClick = vi.fn();

vi.mock("../../api/halo", () => ({
  fetchCategoryItems: (...args: unknown[]) => fetchCategoryItems(...args),
  trackEntityClick: (...args: unknown[]) => trackEntityClick(...args),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

// The list only needs the sentinel to exist; nothing here scrolls, so the
// observer never has to fire.
class NoopObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("IntersectionObserver", NoopObserver);

function page(
  data: CategoryItem[],
  lastEvaluatedKey?: { id: string }
): PaginatedResponse<CategoryItem> {
  return { data, meta: { last_evaluated_key: lastEvaluatedKey } } as PaginatedResponse<CategoryItem>;
}

const ANNA: CategoryItem = {
  id: "1",
  name: "Anna",
  description: "",
  url: "https://halo.test/anna.jpg",
  status: "processed",
  gender: "female",
};

function renderCategory(category: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/${category}`]}>
        <Routes>
          <Route path="/:category" element={<CategoryList />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function genderParams(): Array<string | null | undefined> {
  return fetchCategoryItems.mock.calls.map((call) => call[1].gender);
}

beforeEach(() => {
  fetchCategoryItems.mockReset();
  trackEntityClick.mockReset();
  fetchCategoryItems.mockResolvedValue(page([ANNA]));
});

describe("CategoryList gender filter", () => {
  it("mounts on All and sends no gender", async () => {
    renderCategory("actors");

    await screen.findByText("Anna");
    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    expect(fetchCategoryItems).toHaveBeenCalledTimes(1);
    expect(fetchCategoryItems.mock.calls[0][1].gender).toBeNull();
  });

  it("sends the literal once when a segment is picked, and drops it again on All", async () => {
    renderCategory("actors");
    await screen.findByText("Anna");

    await userEvent.click(screen.getByRole("radio", { name: "Female" }));
    await waitFor(() => expect(fetchCategoryItems).toHaveBeenCalledTimes(2));
    expect(genderParams()).toEqual([null, "female"]);

    await userEvent.click(screen.getByRole("radio", { name: "All" }));
    await waitFor(() => expect(fetchCategoryItems).toHaveBeenCalledTimes(3));
    expect(genderParams()).toEqual([null, "female", null]);
  });

  it("keeps the controls mounted while the new selection is in flight", async () => {
    renderCategory("actors");
    await screen.findByText("Anna");

    let release: (value: PaginatedResponse<CategoryItem>) => void = () => {};
    fetchCategoryItems.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    await userEvent.click(screen.getByRole("radio", { name: "Male" }));

    expect(screen.getByRole("radiogroup", { name: /gender/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();

    release(page([]));
    await screen.findByText("No male actors");
  });

  it("holds back the empty state while a short page still has a cursor", async () => {
    fetchCategoryItems.mockResolvedValue(page([], { id: "next" }));
    renderCategory("actors");

    await waitFor(() => expect(fetchCategoryItems).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/^No /)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Load More" })).toBeInTheDocument();
  });

  it("names both filters in the empty state", async () => {
    fetchCategoryItems.mockResolvedValue(page([]));
    renderCategory("actors");
    await screen.findByText("No items");

    await userEvent.type(screen.getByRole("textbox"), "anna");
    await userEvent.click(screen.getByRole("radio", { name: "Female" }));

    await screen.findByText('No female actors starting with "anna"');
    await waitFor(() => {
      const last = fetchCategoryItems.mock.calls.at(-1)?.[1];
      expect(last).toMatchObject({ filter: "anna", gender: "female" });
    });
  });

  it("renders no gender control for tags and leaves the request unchanged", async () => {
    renderCategory("tags");
    await screen.findByText("Anna");

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(fetchCategoryItems.mock.calls[0][1].gender).toBeNull();
  });
});

/**
 * TD-096: halo defines `PUT /v1/{type}/{id}/click` for every category but
 * franchise, so the one card tap that must send nothing is the franchise one.
 */
describe("CategoryList franchises", () => {
  const TIDEWATER: CategoryItem = {
    id: "f-1",
    name: "Tidewater",
    description: "",
    url: "https://halo.test/tidewater.jpg",
    status: "processed",
  };

  beforeEach(() => {
    fetchCategoryItems.mockResolvedValue(page([TIDEWATER]));
  });

  it("lists franchises off halo's singular path, with no gender control", async () => {
    renderCategory("franchises");
    await screen.findByText("Tidewater");

    expect(fetchCategoryItems.mock.calls[0][0]).toBe("franchise");
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(fetchCategoryItems.mock.calls[0][1].gender).toBeNull();
  });

  it("names the category in the filter-matched-nothing message", async () => {
    fetchCategoryItems.mockResolvedValue(page([]));
    renderCategory("franchises");
    await screen.findByText("No items");

    await userEvent.type(screen.getByRole("textbox"), "zzz");

    await screen.findByText('No franchises starting with "zzz"');
  });

  it("tracks no click when a franchise card is tapped", async () => {
    renderCategory("franchises");

    await userEvent.click(await screen.findByText("Tidewater"));

    expect(trackEntityClick).not.toHaveBeenCalled();
  });

  it("still tracks the click on a category halo has a /click for", async () => {
    fetchCategoryItems.mockResolvedValue(page([ANNA]));
    renderCategory("actors");

    await userEvent.click(await screen.findByText("Anna"));

    expect(trackEntityClick).toHaveBeenCalledWith("actor", "1");
  });
});
