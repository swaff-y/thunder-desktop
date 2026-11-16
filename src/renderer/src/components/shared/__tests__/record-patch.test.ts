import { describe, expect, it } from "vitest";
import type { ContentRecord, RecordRef } from "../../../types";
import { buildRecordPatch, SOURCE_KEYS, type RecordDraft, type SourceKey } from "../record-patch";

const REFS: Record<SourceKey, RecordRef> = {
  series: { id: "ser1", name: "A Series" },
  movie: { id: "mov1", name: "A Movie" },
  webscene: { id: "web1", name: "A Webscene" },
};

function recordWith(source: SourceKey): ContentRecord {
  return {
    id: "rec1",
    name: "A Record",
    [source]: REFS[source],
    actors: [{ id: "act1", name: "An Actor" }],
    tags: [{ id: "tag1", name: "A Tag" }],
    images: [],
  };
}

function draftWith(source: SourceKey | null, record: ContentRecord): RecordDraft {
  return {
    series: source === "series" ? REFS.series : null,
    movie: source === "movie" ? REFS.movie : null,
    webscene: source === "webscene" ? REFS.webscene : null,
    actors: [...record.actors],
    tags: [...record.tags],
  };
}

const orderedPairs = SOURCE_KEYS.flatMap((from) =>
  SOURCE_KEYS.filter((to) => to !== from).map((to) => [from, to] as const)
);

describe("buildRecordPatch", () => {
  it.each(orderedPairs)("swapping %s for %s clears the other two", (from, to) => {
    const record = recordWith(from);

    const body = buildRecordPatch(record, draftWith(to, record));

    expect(body[to]).toEqual(REFS[to]);
    for (const other of SOURCE_KEYS.filter((key) => key !== to)) {
      expect(body[other]).toBeNull();
    }
  });

  it("sends all three sources as null when the user clears the source", () => {
    const record = recordWith("webscene");

    const body = buildRecordPatch(record, draftWith(null, record));

    expect(body).toEqual({ name: "A Record", series: null, movie: null, webscene: null });
  });

  it("sends the unchanged source back rather than omitting it", () => {
    const record = recordWith("webscene");

    const body = buildRecordPatch(record, draftWith("webscene", record));

    expect(body.webscene).toEqual(REFS.webscene);
    expect(body.series).toBeNull();
    expect(body.movie).toBeNull();
  });

  it("names a source halo has never seen without an id", () => {
    const record = recordWith("movie");
    const draft = { ...draftWith(null, record), webscene: { id: "", name: "New Webscene" } };

    expect(buildRecordPatch(record, draft).webscene).toEqual({ name: "New Webscene" });
  });

  it("omits actors and tags that did not change", () => {
    const record = recordWith("movie");

    const body = buildRecordPatch(record, draftWith("movie", record));

    expect(body).not.toHaveProperty("actors");
    expect(body).not.toHaveProperty("tags");
  });

  it("sends actors and tags that did change", () => {
    const record = recordWith("movie");
    const draft = draftWith("movie", record);
    draft.actors = [...draft.actors, { id: "act2", name: "Another Actor" }];
    draft.tags = [{ id: "tag2", name: "Another Tag" }];

    const body = buildRecordPatch(record, draft);

    expect(body.actors).toEqual([
      { id: "act1", name: "An Actor" },
      { id: "act2", name: "Another Actor" },
    ]);
    expect(body.tags).toEqual([{ id: "tag2", name: "Another Tag" }]);
  });
});
