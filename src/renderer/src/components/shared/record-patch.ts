import type {
  ContentRecord,
  RecordPatchBody,
  RecordRef,
  RecordRefInput,
} from "../../types";

/** The sources halo accepts, in the order the edit form lists them. */
export const SOURCE_KEYS = ["series", "movie", "webscene"] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];

/** What the edit form holds: one source at most, plus the two multi-value lists. */
export type RecordDraft = Record<SourceKey, RecordRef | null> & {
  actors: RecordRef[];
  tags: RecordRef[];
};

export function refArraysEqual(a: RecordRef[], b: RecordRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, i) => item.id === b[i].id && item.name === b[i].name)
  );
}

function cleanRef(ref: RecordRef): RecordRefInput {
  return ref.id ? { id: ref.id, name: ref.name } : { name: ref.name };
}

/**
 * TD-097: every source goes out on every PATCH, changed or not.
 *
 * Halo enforces "exactly one of movie, series or webscene", and what refuses
 * the write is the source already on the record — so a changed-fields diff
 * cannot express the swap. Setting a movie on a migrated record has to carry
 * `"webscene": null` or halo answers 400.
 */
export function buildRecordPatch(record: ContentRecord, draft: RecordDraft): RecordPatchBody {
  const body: RecordPatchBody = { name: record.name };
  for (const key of SOURCE_KEYS) {
    const ref = draft[key];
    body[key] = ref ? cleanRef(ref) : null;
  }
  if (!refArraysEqual(record.actors ?? [], draft.actors)) {
    body.actors = draft.actors.map(cleanRef);
  }
  if (!refArraysEqual(record.tags ?? [], draft.tags)) {
    body.tags = draft.tags.map(cleanRef);
  }
  return body;
}
