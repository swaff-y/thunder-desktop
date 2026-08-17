/**
 * TD-058: turns a `kind: 'single'` action into the one card it draws.
 *
 * `get_record` and `get_entity` are not the same shape wearing different
 * names. A record has four image slots, associated actors and a view
 * count; an entity has one avatar and clicks; an `image` has no clicks
 * and a `franchise` has neither. Each absence is mapped explicitly so
 * the card can say "no such field" instead of "zero".
 */

import { SINGLE_TOOLS, type ChatAction, type SingleTool } from "../../../../shared/chat";
import { count, isJsonObject, text } from "./action-json";
import { catalogueRoute, imageTargetFor, type ImageTarget } from "./entity-routes";

export type Chip = {
  key: string;
  name: string;
  initial: string;
  /** Absent where the ref carried no id, so there is nowhere to go. */
  to?: string;
};

export type Metric = {
  label: string;
  /** `null` where the type has the metric but this row does not. */
  value: number | null;
};

/** A record's single association — its series, movie or franchise. */
export type Association = {
  label: string;
  name: string;
  /** Absent where the associated type has no page in this app. */
  to?: string;
};

export type SingleCard = {
  /** The header's `Action · <entity label>`. */
  entityLabel: string;
  name: string;
  tool: string;
  id: string;
  /** Empty where the type counts nothing at all — `franchise`. */
  metrics: Metric[];
  cast: Chip[];
  tags: Chip[];
  associations: Association[];
  /** Absent where there is no picture to fetch. */
  image?: ImageTarget;
  /** Absent where the type has no page in this app. */
  route?: string;
};

function isSingleTool(tool: string | null): tool is SingleTool {
  return tool !== null && (SINGLE_TOOLS as readonly string[]).includes(tool);
}

function labelFor(entityType: string): string {
  return entityType.charAt(0).toUpperCase() + entityType.slice(1);
}

function chipsOf(value: unknown, entityType: string): Chip[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isJsonObject).flatMap((item, index) => {
    const name = text(item.name);
    if (name === undefined) return [];
    const id = text(item.id);
    return [
      {
        key: id ?? `${entityType}-${index}`,
        name,
        initial: name.charAt(0).toUpperCase(),
        to: id === undefined ? undefined : catalogueRoute(entityType, id),
      },
    ];
  });
}

/**
 * A record names its series, movie and franchise as `{id, name}` refs. An
 * absent one is left out rather than shown empty — the record simply has
 * no series, which is not the same as one the card failed to read.
 */
function associationOf(value: unknown, label: string, entityType: string): Association[] {
  if (!isJsonObject(value)) return [];
  const name = text(value.name);
  if (name === undefined) return [];
  const id = text(value.id);
  return [{ label, name, to: id === undefined ? undefined : catalogueRoute(entityType, id) }];
}

export function toSingleCard(action: ChatAction): SingleCard | null {
  const { tool, args, result } = action;
  if (!isSingleTool(tool)) return null;
  if (!isJsonObject(result)) return null;

  const id = text(result.id) ?? text(args.id);
  if (id === undefined) return null;

  const name = text(result.name) ?? "Untitled";
  const entityType = tool === "get_record" ? "record" : text(args.entity_type);

  if (tool === "get_record") {
    return {
      entityLabel: "Record",
      name,
      tool,
      id,
      metrics: [
        { label: "Views", value: count(result.views) },
        { label: "Likes", value: count(result.likes) },
      ],
      cast: chipsOf(result.actors, "actor"),
      tags: chipsOf(result.tags, "tag"),
      associations: [
        ...associationOf(result.series, "Series", "series"),
        ...associationOf(result.movie, "Movie", "movie"),
        ...associationOf(result.franchise, "Franchise", "franchise"),
      ],
      image: imageTargetFor("record", id),
      route: catalogueRoute("record", id),
    };
  }

  return {
    entityLabel: entityType === undefined ? "Entity" : labelFor(entityType),
    name,
    tool,
    id,
    metrics: entityType === "franchise" ? [] : [{ label: "Clicks", value: count(result.clicks) }],
    cast: [],
    tags: [],
    associations: [],
    image: imageTargetFor(entityType, id),
    route: catalogueRoute(entityType, id),
  };
}
