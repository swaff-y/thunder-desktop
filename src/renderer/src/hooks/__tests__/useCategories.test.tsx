import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCategoryList } from "../useCategories";

const fetchCategoryItems = vi.fn();

vi.mock("../../api/halo", () => ({
  fetchCategoryItems: (...args: unknown[]) => fetchCategoryItems(...args),
}));

vi.mock("../useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchCategoryItems.mockReset();
});

describe("useCategoryList gender", () => {
  it("normalises undefined and null onto one cache entry", async () => {
    fetchCategoryItems.mockResolvedValue({ data: [], meta: {} });

    const { result } = renderHook(() => useCategoryList("actor", true, "", null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(["category", "actor", "", null])).toBeDefined();
  });

  it("starts a fresh stream when the gender changes", async () => {
    fetchCategoryItems.mockResolvedValue({
      data: [{ id: "1", name: "Anna" }],
      meta: { last_evaluated_key: { id: "cursor" } },
    });

    const { result, rerender } = renderHook(
      ({ gender }: { gender: "female" | null }) => useCategoryList("actor", true, "", gender),
      { wrapper, initialProps: { gender: null as "female" | null } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    result.current.fetchNextPage();
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    rerender({ gender: "female" });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(fetchCategoryItems.mock.calls.at(-1)?.[1]).toMatchObject({
      gender: "female",
      lastEvaluatedKey: undefined,
    });
  });
});
