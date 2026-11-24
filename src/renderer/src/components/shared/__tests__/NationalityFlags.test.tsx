import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NationalityFlags from "../NationalityFlags";
import type { EntityDetail, Nationality, RecordRef } from "../../../types";

const fetchEntity = vi.fn();

vi.mock("../../../api/halo", () => ({
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
}));

vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true }),
}));

const AU: Nationality = { code: "AU", displayName: "Australian" };
const US: Nationality = { code: "US", displayName: "American" };
const AU_FLAG = "\u{1F1E6}\u{1F1FA}";

function actor(
  id: string,
  name: string,
  gender: EntityDetail["gender"],
  nationality: Nationality | null
): EntityDetail {
  return { id, name, gender, nationality };
}

function respondWith(...entities: EntityDetail[]) {
  fetchEntity.mockImplementation((_type: string, id: string) =>
    Promise.resolve(entities.find((e) => e.id === id))
  );
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderFlags(actors: RecordRef[], client = newClient()) {
  return render(
    <QueryClientProvider client={client}>
      <NationalityFlags actors={actors} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  fetchEntity.mockReset();
});

describe("NationalityFlags", () => {
  it("shows one flag per nationality in actor order", async () => {
    respondWith(actor("a1", "Anna", "female", AU), actor("a2", "Bea", "female", US));

    renderFlags([
      { id: "a1", name: "Anna" },
      { id: "a2", name: "Bea" },
    ]);

    const flags = await screen.findAllByRole("img");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(flags[0]).toHaveAccessibleName("Australian: Anna");
    expect(flags[0]).toHaveTextContent(AU_FLAG);
    expect(flags[1]).toHaveAccessibleName("American: Bea");
  });

  it("merges actors sharing a nationality into one flag", async () => {
    respondWith(
      actor("a1", "Anna", "female", AU),
      actor("a2", "Bea", "female", AU),
      actor("a3", "Cat", "female", US)
    );

    renderFlags([
      { id: "a1", name: "Anna" },
      { id: "a2", name: "Bea" },
      { id: "a3", name: "Cat" },
    ]);

    const flags = await screen.findAllByRole("img");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(flags[0]).toHaveAccessibleName("Australian: Anna, Bea");
    expect(flags[1]).toHaveAccessibleName("American: Cat");
  });

  it("shows nothing for a male actor or a female with no nationality", async () => {
    respondWith(
      actor("a1", "Adam", "male", AU),
      actor("a2", "Bea", "female", null),
      actor("a3", "Cat", "female", AU)
    );

    renderFlags([
      { id: "a1", name: "Adam" },
      { id: "a2", name: "Bea" },
      { id: "a3", name: "Cat" },
    ]);

    const flags = await screen.findAllByRole("img");
    expect(flags).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(flags[0]).toHaveAccessibleName("Australian: Cat");
  });

  it("reads and names a repeated actor once", async () => {
    respondWith(actor("a1", "Anna", "female", AU));

    renderFlags([
      { id: "a1", name: "Anna" },
      { id: "a1", name: "Anna" },
    ]);

    const flags = await screen.findAllByRole("img");
    expect(flags).toHaveLength(1);
    expect(flags[0]).toHaveAccessibleName("Australian: Anna");
    expect(fetchEntity).toHaveBeenCalledTimes(1);
  });

  it("shares one read between columns under the same client", async () => {
    respondWith(actor("a1", "Anna", "female", AU));
    const client = newClient();

    render(
      <QueryClientProvider client={client}>
        <NationalityFlags actors={[{ id: "a1", name: "Anna" }]} />
        <NationalityFlags actors={[{ id: "a1", name: "Anna" }]} />
      </QueryClientProvider>
    );

    expect(await screen.findAllByRole("img")).toHaveLength(2);
    expect(fetchEntity).toHaveBeenCalledTimes(1);
  });

  it("shows nothing while the reads are pending", async () => {
    fetchEntity.mockReturnValue(new Promise(() => {}));

    const { container } = renderFlags([{ id: "a1", name: "Anna" }]);

    await waitFor(() => expect(fetchEntity).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing and reads nothing for a record with no actors", () => {
    const { container } = renderFlags([]);

    expect(container.firstChild).toBeNull();
    expect(fetchEntity).not.toHaveBeenCalled();
  });
});
