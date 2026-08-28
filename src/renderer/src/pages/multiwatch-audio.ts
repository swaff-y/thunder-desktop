/**
 * Which of the grid's cells owns the audio.
 *
 * The id the user last picked is stored as a *request*, not as the answer:
 * the cart can lose the item under it, and a stored id that no longer names
 * a cell would leave the grid silent with every speaker icon claiming
 * otherwise. Resolving on every render instead keeps "exactly one cell is
 * unmuted" true by construction — every cell asks this one function, and
 * only one id can be the answer.
 */
export function resolveActiveId(ids: readonly string[], requested: string | null): string | null {
  if (ids.length === 0) return null;
  return requested !== null && ids.includes(requested) ? requested : ids[0];
}

export function isMuted(id: string, activeId: string | null): boolean {
  return id !== activeId;
}
