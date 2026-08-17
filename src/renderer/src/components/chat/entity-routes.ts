/**
 * Where a halo-mcp entity lives in this app, and what has to be fetched to
 * draw its picture. Shared by every action card: halo-mcp's vocabulary is
 * singular (`actor`), the app's routes are plural (`/actors/:id`), and the
 * two types that have no page here must not be linked at all.
 */

import { CATEGORIES, type CategoryConfig } from "../../types";

/** What a card re-fetches by id to get a live, unexpired image URL. */
export type ImageTarget =
  | { kind: "record"; id: string }
  | { kind: "entity"; entityType: string; id: string };

/** `apiPath` is halo-mcp's singular vocabulary; `type` is the app's route. */
export function categoryFor(entityType: string | undefined): CategoryConfig | undefined {
  return CATEGORIES.find((category) => category.apiPath === entityType);
}

/**
 * `franchise` and `image` have no page in this app, so they get no route —
 * a card links somewhere real or not at all.
 */
export function catalogueRoute(entityType: string | undefined, id: string): string | undefined {
  if (!id) return undefined;
  if (entityType === "record") return `/watch/${id}`;
  const category = categoryFor(entityType);
  if (!category) return undefined;
  return `/${category.type}/${id}`;
}

/**
 * The halo types that carry an avatar. An allowlist rather than "anything
 * but `franchise`": `entity_type` is the model's argument echoed back, and
 * it ends up as a path segment on an authenticated request.
 */
const AVATAR_TYPES: ReadonlySet<string> = new Set(["actor", "movie", "series", "tag", "image"]);

/**
 * A record's own images are a slot per thumbnail; every other type has one
 * avatar, and `franchise` has none at all.
 */
export function imageTargetFor(
  entityType: string | undefined,
  id: string
): ImageTarget | undefined {
  if (!id) return undefined;
  if (entityType === "record") return { kind: "record", id };
  if (entityType === undefined || !AVATAR_TYPES.has(entityType)) return undefined;
  return { kind: "entity", entityType, id };
}
