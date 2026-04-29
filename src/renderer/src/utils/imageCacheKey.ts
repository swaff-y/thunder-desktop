/**
 * Builds a stable cache key for an image from the BE-provided imageKey + imageVersion
 * fields. Returns null if imageKey is missing — callers should fall through to
 * direct presigned-URL rendering in that case.
 *
 * Structurally typed: accepts any object with optional imageKey/imageVersion fields,
 * which lets RecordImage and CategoryItem (and any future shape with these fields)
 * share this helper.
 */
export function buildImageCacheKey(image: {
  imageKey?: string;
  imageVersion?: number | string;
}): string | null {
  if (!image.imageKey) return null;
  return image.imageVersion !== undefined
    ? `${image.imageKey}:${image.imageVersion}`
    : image.imageKey;
}
