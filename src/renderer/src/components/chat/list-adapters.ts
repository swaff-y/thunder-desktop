/**
 * TD-057: turns a `kind: 'list'` action into the rows the card draws.
 *
 * The four halo-mcp list tools share an `{ items, next_cursor }` envelope
 * but nothing else — the id key, the metric and what the metric *means*
 * all differ. Each difference the adapter papers over is a way for the
 * card to say something false, so they are mapped explicitly here rather
 * than guessed at render time.
 */

import { LIST_TOOLS, type ChatAction, type ListTool } from "../../../../shared/chat";
import { CATEGORIES, type CategoryConfig } from "../../types";

/** The design shows six rows inline; the rest wait for the Expand drawer. */
export const MAX_ROWS = 6;

export type ListRowCta = {
  label: string;
  to: string;
};

export type ListRow = {
  key: string;
  name: string;
  /** Records only — the actors, comma-joined. */
  secondary?: string;
  id: string;
  /** `null` where the tool carries no metric for this type — never 0. */
  metric: number | null;
  /** Absent when the entity type has no route in this app. */
  cta?: ListRowCta;
};

export type ListCard = {
  title: string;
  tool: string;
  metricLabel: string;
  rows: ListRow[];
  /** Rows in the page, before the six-row cap. */
  total: number;
  hasMore: boolean;
  /** "all time" for the ranking tool, which is not a windowed metric. */
  note?: string;
  emptyMessage: string;
};

type JsonObject = Record<string, unknown>;

/** halo-mcp types with no `CATEGORIES` entry, so no route and no CTA. */
const UNROUTED_PLURALS: Record<string, string> = {
  franchise: "Franchises",
  image: "Images",
  record: "Records",
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isListTool(tool: string | null): tool is ListTool {
  return tool !== null && (LIST_TOOLS as readonly string[]).includes(tool);
}

function itemsOf(result: unknown): JsonObject[] {
  if (!isJsonObject(result) || !Array.isArray(result.items)) return [];
  return result.items.filter(isJsonObject);
}

/**
 * A cursor is opaque and bound to the call that issued it, so the card
 * only ever learns *that* there is more, never enough to ask for it.
 */
function hasMore(result: unknown): boolean {
  return isJsonObject(result) && text(result.next_cursor) !== undefined;
}

/** `apiPath` is halo-mcp's singular vocabulary; `type` is the app's route. */
function categoryFor(entityType: string | undefined): CategoryConfig | undefined {
  return CATEGORIES.find((category) => category.apiPath === entityType);
}

function pluralOf(entityType: string | undefined): string {
  const category = categoryFor(entityType);
  if (category) return category.label;
  return (entityType && UNROUTED_PLURALS[entityType]) ?? "Results";
}

function recordCta(id: string): ListRowCta | undefined {
  return id ? { label: "View record", to: `/watch/${id}` } : undefined;
}

/**
 * `franchise` and `image` have no page in this app. A row without a
 * route renders without a CTA rather than with a button that dead-ends.
 */
function entityCta(entityType: string | undefined, id: string): ListRowCta | undefined {
  if (!id) return undefined;
  if (entityType === "record") return recordCta(id);
  const category = categoryFor(entityType);
  if (!category) return undefined;
  return { label: `View ${entityType}`, to: `/${category.type}/${id}` };
}

function actorNames(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.filter(isJsonObject).map((actor) => text(actor.name));
  const named = names.filter((name): name is string => name !== undefined);
  return named.length > 0 ? named.join(", ") : undefined;
}

function recordRow(item: JsonObject, index: number): ListRow {
  const id = text(item.id) ?? "";
  return {
    key: id || `row-${index}`,
    name: text(item.name) ?? "Untitled",
    secondary: actorNames(item.actors),
    id,
    metric: count(item.views),
    cta: recordCta(id),
  };
}

/**
 * `list_entities` and `get_top_entities` agree on everything but where
 * the id and the metric live — `id`/`clicks` against `entity_id`/`count`.
 */
function entityRow(
  item: JsonObject,
  index: number,
  entityType: string | undefined,
  idKey: "id" | "entity_id",
  metricKey: "clicks" | "count"
): ListRow {
  const id = text(item[idKey]) ?? "";
  return {
    key: id || `row-${index}`,
    name: text(item.name) ?? "Untitled",
    id,
    metric: count(item[metricKey]),
    cta: entityCta(entityType, id),
  };
}

/**
 * A `filter` that matched nothing has not proved the thing is absent —
 * halo-mcp matches a name prefix, so the copy has to say so.
 */
function emptyMessageFor(tool: ListTool, filter: string | undefined, entityType: string | undefined): string {
  if (filter) return `Nothing starts with '${filter}'.`;
  if (tool === "get_related_records") return `No records for this ${entityType ?? "entity"}.`;
  return "Nothing to show.";
}

function titleFor(tool: ListTool, filter: string | undefined, entityType: string | undefined): string {
  const starting = filter ? ` starting with '${filter}'` : "";
  switch (tool) {
    case "search_records":
      return `Records${starting}`;
    case "get_related_records":
      return `Records for this ${entityType ?? "entity"}`;
    case "list_entities":
      return `${pluralOf(entityType)}${starting}`;
    case "get_top_entities":
      return `Top ${pluralOf(entityType).toLowerCase()}`;
  }
}

/**
 * Halo echoes which event it ranked by — `record` is ranked on views,
 * every other type on clicks — so the column takes its label from the
 * response rather than from an assumption about the type.
 */
function metricLabelFor(tool: ListTool, result: unknown, entityType: string | undefined): string {
  if (tool === "list_entities") return "Clicks";
  if (tool !== "get_top_entities") return "Views";
  const echoed = isJsonObject(result) ? text(result.event_type) : undefined;
  if (echoed) return echoed === "view" ? "Views" : "Clicks";
  return entityType === "record" ? "Views" : "Clicks";
}

export function toListCard(action: ChatAction): ListCard | null {
  const { tool, args, result } = action;
  if (!isListTool(tool)) return null;

  const filter = text(args.filter);
  const rankedEntityType = isJsonObject(result) ? text(result.entity_type) : undefined;
  const entityType =
    tool === "get_top_entities" ? (rankedEntityType ?? text(args.entity_type)) : text(args.entity_type);

  const items = itemsOf(result);
  const rows = items.slice(0, MAX_ROWS).map((item, index) => {
    switch (tool) {
      case "search_records":
      case "get_related_records":
        return recordRow(item, index);
      case "list_entities":
        return entityRow(item, index, entityType, "id", "clicks");
      case "get_top_entities":
        return entityRow(item, index, entityType, "entity_id", "count");
    }
  });

  return {
    title: titleFor(tool, filter, entityType),
    tool,
    metricLabel: metricLabelFor(tool, result, entityType),
    rows,
    total: items.length,
    hasMore: hasMore(result),
    note: tool === "get_top_entities" ? "all time" : undefined,
    emptyMessage: emptyMessageFor(tool, filter, entityType),
  };
}
