/**
 * TD-070: what page the question was asked from.
 *
 * The mirror image of `entity-routes.ts`. That file answers "where does a
 * halo-mcp entity live in this app"; this one answers "which halo-mcp entity
 * is the user looking at". Both read the same `CATEGORIES` table, because
 * two tables of the same fact is exactly the drift `EntityRoutes` exists to
 * stop — halo-mcp's vocabulary is singular (`actor`), this app's routes are
 * plural (`/actors/:id`), and only `CATEGORIES` knows both spellings.
 *
 * `label` is never set. The router knows the id, not the name, and the
 * server treats the label as decoration it never answers from.
 */

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import type { ViewContext, ViewSource } from "@swaff-y/thunder-chat-core";
import { getCategoryConfig } from "../../types";

/**
 * The pure half: a path from `HashRouter` to the view it stands for, or
 * `null` when the page has nothing the agent can use.
 *
 * `null` is the normal answer — Home, Stats, Browser, Multi-watch, Login and
 * every unrecognised segment all land here. An unknown category resolves to
 * nothing rather than to a guessed singular, the same rule `catalogueRoute`
 * applies to `franchise` and `image`.
 */
export function viewForPath(pathname: string): ViewContext | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || segments.length > 2) return null;

  const [head, id] = segments;

  // `/watch/:id` is the one route whose entity is a record, and records
  // have no `CategoryConfig` — they are not a browsable category.
  if (head === "watch") return id ? { kind: "record", id } : null;

  const category = getCategoryConfig(head);
  if (!category) return null;

  if (id === undefined) return { kind: "list", type: category.apiPath };
  return { kind: "entity", type: category.apiPath, id };
}

/** A {@link ViewSource} whose answer is written from outside it. */
export interface TrackedViewSource extends ViewSource {
  track: (view: ViewContext | null) => void;
}

/**
 * The view is read once, at ask time — so it is held in a closure rather
 * than in state. Nothing re-renders when the user navigates; `current` just
 * starts returning a different answer.
 */
export function createViewSource(): TrackedViewSource {
  let view: ViewContext | null = null;
  return {
    current: () => view,
    track: (next) => {
      view = next;
    }
  };
}

/**
 * Keeps a {@link TrackedViewSource} pointed at the current route.
 *
 * Must be called from a component rendered *below* the router and *below*
 * the component that owns the source: `useLocation` re-renders its caller on
 * every navigation, and the caller here has to be a leaf that renders
 * nothing, not the provider that wraps the app.
 */
export function useViewTracking(source: TrackedViewSource): void {
  const { pathname } = useLocation();
  useEffect(() => {
    source.track(viewForPath(pathname));
  }, [source, pathname]);
}
