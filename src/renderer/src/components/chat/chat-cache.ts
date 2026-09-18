/**
 * TD-086: what a chat turn's write means for the query cache.
 */

import type { QueryKey } from "@tanstack/react-query";
import type { ChatAction } from "@swaff-y/thunder-chat-core";

/**
 * The halo-mcp tools that change something. This is halo-mcp's vocabulary
 * held on this side of the wire, so it drifts the day halo-mcp adds a tool —
 * the same failure mode as `LIST_TOOLS` (TD-078). A write missing from here
 * leaves the page showing what it showed before the turn.
 */
export const WRITE_TOOLS = new Set([
  "update_record",
  "reprocess_record",
  "request_upload_url",
  "request_image_slot_upload_url",
  "create_record",
  "update_actor",
  "create_entity",
  "delete_item",
  "unassociate_entity",
]);

/** The tools whose subject is a record, whatever their args call it. */
const RECORD_TOOLS = new Set([
  "update_record",
  "reprocess_record",
  "request_upload_url",
  "create_record",
]);

/**
 * Prefixes, not exact keys, so `["records", apiPath, id]` and
 * `["category", apiPath, filter, gender]` both match without the renderer
 * guessing which list is on screen. Every write gets all four: a rename shows
 * in each of them, an association change moves a record between entity lists,
 * and Halo's `array_check_and_create` manufactures entities from a record
 * patch, so even a record write can add rows to an entity list.
 */
const COLLECTION_KEYS: QueryKey[] = [
  ["records"],
  ["category"],
  ["randomRecords"],
  ["userRecords"],
];

function stringArg(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function subjectKey(tool: string, args: Record<string, unknown>): QueryKey | undefined {
  const id = stringArg(args, "id");
  if (!id) return undefined;
  if (RECORD_TOOLS.has(tool)) return ["record", id];
  // halo-mcp's `entity_type` is singular — `actor`, never `actors` and never a
  // route segment — which is what `["entity", …]` already holds.
  const entityType = stringArg(args, "entity_type");
  if (!entityType) return undefined;
  return entityType === "record" ? ["record", id] : ["entity", entityType, id];
}

/** The keys a settled turn should invalidate. A read turn invalidates nothing. */
export function invalidationsFor(action: ChatAction | undefined): QueryKey[] {
  const tool = action?.tool;
  if (!tool || !WRITE_TOOLS.has(tool)) return [];
  const subject = subjectKey(tool, action?.args ?? {});
  return subject ? [subject, ...COLLECTION_KEYS] : [...COLLECTION_KEYS];
}
