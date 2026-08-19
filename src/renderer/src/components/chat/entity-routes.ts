/**
 * Where a halo-mcp entity lives in this app, and what has to be fetched to
 * draw its picture. Shared by every action card: halo-mcp's vocabulary is
 * singular (`actor`), the app's routes are plural (`/actors/:id`), and the
 * two types that have no page here must not be linked at all.
 */

import type { EntityRoutes } from "@swaff-y/thunder-chat-core";
import { CATEGORIES, type CategoryConfig } from "../../types";


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

// `imageTargetFor` moved to the package with the adapters: it names halo
// types and ids, not this app's routes, so it is not per-client.
export { imageTargetFor, type ImageTarget } from "@swaff-y/thunder-chat-core";

/**
 * TCC-002: the adapters moved to `@swaff-y/thunder-chat-core`, which cannot
 * know this app's routes — React Native has no URLs at all. It asks for them
 * through this port instead, and "no matching route means no CTA" stays a
 * decision this app makes.
 */
export const APP_ROUTES: EntityRoutes = {
  routeFor: catalogueRoute,
  pluralFor: (entityType) => categoryFor(entityType)?.label,
};
