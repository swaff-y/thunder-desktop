import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContentRecord, RecordPatchBody } from "../../../types";
import ContentTable from "../ContentTable";

vi.mock("../../../hooks/useCategories", () => ({
  useCategoryList: () => ({ data: undefined }),
}));

const WEBSCENE_RECORD: ContentRecord = {
  id: "rec1",
  name: "A Record",
  webscene: { id: "web1", name: "A Webscene" },
  actors: [{ id: "act1", name: "An Actor" }],
  tags: [{ id: "tag1", name: "A Tag" }],
  images: [],
};

function renderTable(onUpdate?: (body: RecordPatchBody) => Promise<void>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentTable record={WEBSCENE_RECORD} onUpdate={onUpdate} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ContentTable", () => {
  it("links a webscene record to its webscene in view mode", () => {
    renderTable();

    expect(screen.getByRole("link", { name: "A Webscene" })).toHaveAttribute(
      "href",
      "/webscenes/web1"
    );
  });

  it("shows the webscene as a removable pill in edit mode", async () => {
    const user = userEvent.setup();
    renderTable(vi.fn());

    await user.click(screen.getByTitle("Edit"));

    expect(screen.getByText("Webscene:")).toBeInTheDocument();
    expect(screen.getByText("A Webscene")).toBeInTheDocument();
  });

  it("locks the other two sources out while one is chosen", async () => {
    const user = userEvent.setup();
    renderTable(vi.fn());

    await user.click(screen.getByTitle("Edit"));

    expect(screen.getByPlaceholderText("Search series...")).toBeDisabled();
    expect(screen.getByPlaceholderText("Search movies...")).toBeDisabled();
    expect(screen.queryByPlaceholderText("Search webscenes...")).not.toBeInTheDocument();
  });

  it("frees the other sources once the chosen one is removed", async () => {
    const user = userEvent.setup();
    renderTable(vi.fn());

    await user.click(screen.getByTitle("Edit"));
    await user.click(screen.getByRole("button", { name: "Remove webscene" }));

    expect(screen.getByPlaceholderText("Search series...")).toBeEnabled();
    expect(screen.getByPlaceholderText("Search movies...")).toBeEnabled();
    expect(screen.getByPlaceholderText("Search webscenes...")).toBeEnabled();
  });

  it("surfaces a refused save instead of appearing to work", async () => {
    const user = userEvent.setup();
    const refusal = 'Only one of movie, series or webscene: send "webscene": null to clear it';
    renderTable(vi.fn().mockRejectedValue(new Error(refusal)));

    await user.click(screen.getByTitle("Edit"));
    await user.click(screen.getByTitle("Save"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(refusal));
    expect(screen.getByTitle("Save")).toBeInTheDocument();
  });

  it("leaves edit mode on a save that succeeds", async () => {
    const user = userEvent.setup();
    renderTable(vi.fn().mockResolvedValue(undefined));

    await user.click(screen.getByTitle("Edit"));
    await user.click(screen.getByTitle("Save"));

    await waitFor(() => expect(screen.queryByTitle("Save")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
