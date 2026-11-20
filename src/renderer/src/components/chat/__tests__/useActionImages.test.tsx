import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useActionImages } from "../useActionImages";

const fetchEntity = vi.fn();
const fetchRecord = vi.fn();

vi.mock("../../../api/halo", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
  fetchRecord: (...args: unknown[]) => fetchRecord(...args),
}));

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchEntity.mockReset();
  fetchRecord.mockReset();
});

describe("useActionImages entity target", () => {
  it("yields one slide per slot when the entity carries images", async () => {
    fetchEntity.mockResolvedValue({
      id: "w-1",
      name: "Harbour Chase",
      images: [
        { url: "", status: "awaiting" },
        { url: "https://halo.test/a.jpg", imageKey: "a", status: "processed" },
      ],
    });

    const { result } = renderHook(
      () => useActionImages({ kind: "entity", entityType: "webscene", id: "w-1" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.slides).toHaveLength(2));
    expect(result.current.slides[0]).toMatchObject({ url: undefined, label: "Awaiting upload" });
    expect(result.current.slides[1]).toMatchObject({
      url: "https://halo.test/a.jpg",
      label: undefined,
    });
  });

  it("yields the single avatar slide when the entity has no images", async () => {
    fetchEntity.mockResolvedValue({
      id: "a-1",
      name: "Anna",
      url: "https://halo.test/anna.jpg",
      imageKey: "anna",
      status: "processed",
    });

    const { result } = renderHook(
      () => useActionImages({ kind: "entity", entityType: "actor", id: "a-1" }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.slides).toHaveLength(1));
    expect(result.current.slides[0]).toMatchObject({
      url: "https://halo.test/anna.jpg",
      imageKey: "anna",
    });
  });
});
