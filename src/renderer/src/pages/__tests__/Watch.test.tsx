import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContentRecord } from "../../types";
import Watch from "../Watch";

const fetchRecord = vi.fn();
const updateRecord = vi.fn(async () => {});

vi.mock("../../api/halo", () => ({
  fetchRecord: (...args: unknown[]) => fetchRecord(...args),
  fetchCategoryItems: vi.fn(async () => ({ data: [], meta: {} })),
  buildAuthProxyUrl: (id: string) => `https://halo.test/v1/proxy/${id}`,
  watchRecord: vi.fn(async () => {}),
  likeRecord: vi.fn(async () => {}),
  updateRecord: (...args: unknown[]) => updateRecord(...(args as [])),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

vi.mock("../../hooks/useTabHistory", () => ({
  useTabHistory: () => ({ resolveWatchBackTarget: () => "/actors" }),
}));

function record(name: string): ContentRecord {
  return { id: "rec-1", name, actors: [], tags: [], images: [] } as ContentRecord;
}

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderWatch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Watch id="rec-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function reloadButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Reload record" });
}

beforeEach(() => {
  fetchRecord.mockReset();
  updateRecord.mockClear();
});

describe("Watch reload button", () => {
  it("refetches the record once per click and redraws with the server's copy", async () => {
    fetchRecord.mockResolvedValueOnce(record("Old name")).mockResolvedValueOnce(record("New name"));
    renderWatch();

    await screen.findByRole("heading", { level: 2, name: "Old name" });
    await userEvent.click(reloadButton());

    await screen.findByRole("heading", { level: 2, name: "New name" });
    expect(fetchRecord).toHaveBeenCalledTimes(2);
  });

  it("does not remount the player when the record's name changes", async () => {
    fetchRecord.mockResolvedValueOnce(record("Old name")).mockResolvedValueOnce(record("New name"));
    const { container } = renderWatch();

    await screen.findByRole("heading", { level: 2, name: "Old name" });
    const video = container.querySelector("video");
    const src = video?.getAttribute("src");

    await userEvent.click(reloadButton());
    await screen.findByRole("heading", { level: 2, name: "New name" });

    expect(container.querySelector("video")).toBe(video);
    expect(video?.getAttribute("src")).toBe(src);
  });

  it("is disabled while the request is in flight", async () => {
    const pending = deferred<ContentRecord>();
    fetchRecord.mockResolvedValueOnce(record("Old name")).mockReturnValueOnce(pending.promise);
    renderWatch();

    await screen.findByRole("heading", { level: 2, name: "Old name" });
    await userEvent.click(reloadButton());

    await waitFor(() => expect(reloadButton()).toBeDisabled());

    pending.resolve(record("New name"));
    await waitFor(() => expect(reloadButton()).toBeEnabled());
  });

  it("is disabled while the content table is editing and enabled again on cancel", async () => {
    fetchRecord.mockResolvedValue(record("Old name"));
    renderWatch();

    await screen.findByRole("heading", { level: 2, name: "Old name" });
    await userEvent.click(screen.getByTitle("Edit"));
    expect(reloadButton()).toBeDisabled();

    await userEvent.click(screen.getByTitle("Cancel"));
    await waitFor(() => expect(reloadButton()).toBeEnabled());
  });

  it("is enabled again once an edit is saved", async () => {
    fetchRecord.mockResolvedValue(record("Old name"));
    renderWatch();

    await screen.findByRole("heading", { level: 2, name: "Old name" });
    await userEvent.click(screen.getByTitle("Edit"));
    await userEvent.click(screen.getByTitle("Save"));

    await waitFor(() => expect(reloadButton()).toBeEnabled());
    expect(updateRecord).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous record on screen when a reload fails", async () => {
    fetchRecord
      .mockResolvedValueOnce(record("Old name"))
      .mockRejectedValueOnce(new Error("network down"));
    renderWatch();

    await screen.findByRole("heading", { level: 2, name: "Old name" });
    await userEvent.click(reloadButton());

    await waitFor(() => expect(fetchRecord).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { level: 2, name: "Old name" })).toBeInTheDocument();
    expect(screen.queryByText("network down")).not.toBeInTheDocument();
  });
});
