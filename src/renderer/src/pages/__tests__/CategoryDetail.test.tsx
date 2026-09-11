import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContentRecord, PaginatedResponse } from "../../types";
import CategoryDetail from "../CategoryDetail";

const fetchCategoryRecords = vi.fn();

vi.mock("../../api/halo", () => ({
  fetchCategoryRecords: (...args: unknown[]) => fetchCategoryRecords(...args),
  fetchRandomRecords: vi.fn(),
  fetchUserRecords: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

class NoopObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("IntersectionObserver", NoopObserver);

function page(name: string, lastEvaluatedKey?: { id: string }): PaginatedResponse<ContentRecord> {
  return {
    data: [{ id: name, name, actors: [], tags: [], images: [] }],
    meta: { last_evaluated_key: lastEvaluatedKey },
  } as PaginatedResponse<ContentRecord>;
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderDetail() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/series/abc"]}>
        <Routes>
          <Route path="/:category/:id" element={<CategoryDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function reloadButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Reload records" });
}

beforeEach(() => {
  fetchCategoryRecords.mockReset();
});

describe("CategoryDetail reload button", () => {
  it("refetches every loaded page in order", async () => {
    fetchCategoryRecords
      .mockResolvedValueOnce(page("one", { id: "cursor-1" }))
      .mockResolvedValueOnce(page("two"))
      .mockResolvedValueOnce(page("one", { id: "cursor-1" }))
      .mockResolvedValueOnce(page("two"));
    renderDetail();

    await screen.findByRole("button", { name: "Load More" });
    await userEvent.click(screen.getByRole("button", { name: "Load More" }));
    await waitFor(() => expect(fetchCategoryRecords).toHaveBeenCalledTimes(2));

    await userEvent.click(reloadButton());

    await waitFor(() => expect(fetchCategoryRecords).toHaveBeenCalledTimes(4));
    expect(fetchCategoryRecords.mock.calls[2][2].lastEvaluatedKey).toBeUndefined();
    expect(fetchCategoryRecords.mock.calls[3][2].lastEvaluatedKey).toBe("cursor-1");
  });

  it("is disabled while the request is in flight", async () => {
    const pending = deferred<PaginatedResponse<ContentRecord>>();
    fetchCategoryRecords.mockResolvedValueOnce(page("one")).mockReturnValueOnce(pending.promise);
    renderDetail();

    await waitFor(() => expect(reloadButton()).toBeEnabled());
    await userEvent.click(reloadButton());

    await waitFor(() => expect(reloadButton()).toBeDisabled());

    pending.resolve(page("one"));
    await waitFor(() => expect(reloadButton()).toBeEnabled());
  });

  it("keeps the loaded list on screen when a reload fails", async () => {
    fetchCategoryRecords
      .mockResolvedValueOnce(page("one"))
      .mockRejectedValueOnce(new Error("network down"));
    renderDetail();

    await waitFor(() => expect(reloadButton()).toBeEnabled());
    await userEvent.click(reloadButton());

    await waitFor(() => expect(fetchCategoryRecords).toHaveBeenCalledTimes(2));
    expect(reloadButton()).toBeInTheDocument();
    expect(screen.queryByText("network down")).not.toBeInTheDocument();
  });
});
