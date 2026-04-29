import { useEffect, useState } from "react";
import { getCachedImage, cacheImage } from "../utils/imageCache";

export function useImage(imageId: string, presignedUrl: string): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;

    (async () => {
      try {
        let blob = await getCachedImage(imageId);
        if (controller.signal.aborted) return;

        if (!blob) {
          const res = await fetch(presignedUrl, { signal: controller.signal });
          if (!res.ok) return;
          blob = await res.blob();
          if (controller.signal.aborted) return;
          // Best-effort cache write — don't let QuotaExceededError or any
          // other IDB failure break image rendering.
          try {
            await cacheImage(imageId, blob);
          } catch {
            /* swallow — image still renders from the in-memory blob */
          }
          if (controller.signal.aborted) return;
        }

        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        // Includes AbortError on unmount mid-fetch and network failures.
        // Stay silent — src remains null and the consumer keeps showing
        // its loading state.
      }
    })();

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, presignedUrl]);

  return src;
}
