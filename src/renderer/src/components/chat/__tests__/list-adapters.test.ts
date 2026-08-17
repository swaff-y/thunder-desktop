import { describe, expect, it } from "vitest";
import { toListCard } from "../list-adapters";
import { listAction } from "./fixtures";

describe("toListCard", () => {
  it("maps search_records to record rows with comma-joined actors and a views metric", () => {
    const card = toListCard(
      listAction("search_records", { filter: "nig" }, {
        items: [
          {
            id: "rec-1",
            name: "Nightjar Sessions",
            actors: [{ id: "a-1", name: "Jane Doe" }, { id: "a-2", name: "Mara Vale" }],
            views: 1204,
          },
        ],
        next_cursor: null,
      })
    );

    expect(card).toMatchObject({
      title: "Records starting with 'nig'",
      tool: "search_records",
      metricLabel: "Views",
      total: 1,
      hasMore: false,
    });
    expect(card?.rows[0]).toEqual({
      key: "rec-1",
      name: "Nightjar Sessions",
      secondary: "Jane Doe, Mara Vale",
      id: "rec-1",
      metric: 1204,
      cta: { label: "View record", to: "/watch/rec-1" },
    });
  });

  it("maps get_related_records to the same record shape", () => {
    const card = toListCard(
      listAction("get_related_records", { entity_type: "actor", id: "a-1" }, {
        items: [{ id: "rec-9", name: "Low Tide", actors: [{ id: "a-1", name: "Jane Doe" }], views: 7 }],
        next_cursor: null,
      })
    );

    expect(card?.title).toBe("Records for this actor");
    expect(card?.metricLabel).toBe("Views");
    expect(card?.rows[0]).toMatchObject({
      secondary: "Jane Doe",
      metric: 7,
      cta: { label: "View record", to: "/watch/rec-9" },
    });
  });

  it("maps list_entities to entity rows with a clicks metric and no secondary line", () => {
    const card = toListCard(
      listAction("list_entities", { entity_type: "actor", filter: "mar" }, {
        items: [{ id: "a-2", name: "Mara Vale", clicks: 88 }],
        next_cursor: null,
      })
    );

    expect(card?.title).toBe("Actors starting with 'mar'");
    expect(card?.metricLabel).toBe("Clicks");
    expect(card?.rows[0]).toEqual({
      key: "a-2",
      name: "Mara Vale",
      id: "a-2",
      metric: 88,
      cta: { label: "View actor", to: "/actors/a-2" },
    });
  });

  it("maps get_top_entities to ranked rows keyed on entity_id with a count metric", () => {
    const card = toListCard(
      listAction("get_top_entities", { entity_type: "actor" }, {
        entity_type: "actor",
        event_type: "click",
        items: [{ entity_id: "a-2", name: "Mara Vale", count: 50 }],
      })
    );

    expect(card?.title).toBe("Top actors");
    expect(card?.note).toBe("all time");
    expect(card?.rows[0]).toEqual({
      key: "a-2",
      name: "Mara Vale",
      id: "a-2",
      metric: 50,
      cta: { label: "View actor", to: "/actors/a-2" },
    });
  });

  it("labels the get_top_entities metric from the echoed event_type, not the tool", () => {
    const records = toListCard(
      listAction("get_top_entities", { entity_type: "record" }, {
        entity_type: "record",
        event_type: "view",
        items: [{ entity_id: "rec-1", name: "Nightjar Sessions", count: 900 }],
      })
    );
    const actors = toListCard(
      listAction("get_top_entities", { entity_type: "actor" }, {
        entity_type: "actor",
        event_type: "click",
        items: [{ entity_id: "a-2", name: "Mara Vale", count: 50 }],
      })
    );

    expect(records?.metricLabel).toBe("Views");
    expect(records?.rows[0].cta).toEqual({ label: "View record", to: "/watch/rec-1" });
    expect(actors?.metricLabel).toBe("Clicks");
  });

  it("leaves the metric null when the type carries no clicks field", () => {
    const card = toListCard(
      listAction("list_entities", { entity_type: "franchise" }, {
        items: [{ id: "f-1", name: "Tidewater" }],
        next_cursor: null,
      })
    );

    expect(card?.rows[0].metric).toBeNull();
  });

  it("gives an entity type with no app route no CTA", () => {
    const card = toListCard(
      listAction("list_entities", { entity_type: "franchise" }, {
        items: [{ id: "f-1", name: "Tidewater" }],
        next_cursor: null,
      })
    );

    expect(card?.rows[0].cta).toBeUndefined();
  });

  it("reports a filtered empty result as a prefix miss", () => {
    const card = toListCard(
      listAction("search_records", { filter: "zzz" }, { items: [], next_cursor: null })
    );

    expect(card?.rows).toHaveLength(0);
    expect(card?.emptyMessage).toBe("Nothing starts with 'zzz'.");
  });

  it("flags more available from next_cursor without exposing it", () => {
    const result = { items: [{ id: "a-1", name: "Jane Doe", clicks: 1 }], next_cursor: "opaque-cursor" };
    const withCursor = toListCard(listAction("list_entities", { entity_type: "actor" }, result));
    const withoutCursor = toListCard(
      listAction("list_entities", { entity_type: "actor" }, { ...result, next_cursor: null })
    );

    expect(withCursor?.hasMore).toBe(true);
    expect(JSON.stringify(withCursor)).not.toContain("opaque-cursor");
    expect(withoutCursor?.hasMore).toBe(false);
  });

  it("caps the rows at six while reporting the whole page", () => {
    const items = Array.from({ length: 9 }, (_, index) => ({
      id: `a-${index}`,
      name: `Actor ${index}`,
      clicks: index,
    }));

    const card = toListCard(listAction("list_entities", { entity_type: "actor" }, { items }));

    expect(card?.rows).toHaveLength(6);
    expect(card?.total).toBe(9);
  });

  it("returns nothing for a tool it does not map", () => {
    expect(toListCard(listAction("get_record", { id: "rec-1" }, { id: "rec-1" }))).toBeNull();
  });
});
