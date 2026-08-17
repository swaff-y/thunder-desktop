/**
 * Narrowing for halo-mcp payloads, which reach the renderer as `unknown`.
 *
 * Shared by the list and single card adapters: both read the same JSON off
 * the same actions, and a card that guessed at a shape is exactly how it
 * comes to say something the catalogue never said.
 */

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A present, non-empty string, or nothing — an empty name is not a name. */
export function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `null` where the field is absent, so a card never renders it as `0`. */
export function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
