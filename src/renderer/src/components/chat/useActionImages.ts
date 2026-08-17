/**
 * TD-058: an action's pictures, fetched by id.
 *
 * halo-mcp's `url` fields are presigned and stripped before the action
 * ever reaches the renderer (TD-054), so a card that drew them would
 * show broken images the moment a conversation is restored. The action
 * carries ids; this hook turns an id into slides through the app's own
 * Halo client, which means React Query caches them beside every other
 * catalogue read rather than fetching per card.
 */

import { useEntity } from "../../hooks/useEntity";
import { useRecord } from "../../hooks/useRecord";
import type { ImageSlotStatus, RecordImage } from "../../types";
import type { CarouselImage } from "../shared/ImageCarousel";
import type { ImageTarget } from "./entity-routes";

export interface ActionImages {
  slides: CarouselImage[];
  isLoading: boolean;
  isError: boolean;
}

const NO_IMAGES: ActionImages = { slides: [], isLoading: false, isError: false };

/**
 * A slot that is not processed has no picture to draw, so it says why.
 * `awaiting` is not `processing` — nothing has been uploaded into that
 * slot yet, and calling it "Processing" would imply work in flight.
 */
const SLOT_LABEL: Record<ImageSlotStatus, string | undefined> = {
  processed: undefined,
  processing: "Processing",
  awaiting: "Awaiting upload",
  failed: "Failed",
};

function labelFor(status: ImageSlotStatus | undefined): string | undefined {
  return status === undefined ? undefined : SLOT_LABEL[status];
}

function slideFor(image: RecordImage, index: number): CarouselImage {
  return {
    url: image.url || undefined,
    imageKey: image.imageKey ?? `slot-${index}`,
    label: labelFor(image.status),
  };
}

export function useActionImages(target: ImageTarget | undefined): ActionImages {
  const isRecord = target?.kind === "record";
  const record = useRecord(isRecord ? target.id : "", isRecord);

  const isEntity = target?.kind === "entity";
  const entity = useEntity(
    isEntity ? target.entityType : "",
    isEntity ? target.id : "",
    isEntity
  );

  if (isRecord) {
    return {
      slides: (record.data?.images ?? []).map(slideFor),
      isLoading: record.isLoading,
      isError: record.isError,
    };
  }

  if (isEntity) {
    const avatar = entity.data;
    return {
      slides:
        avatar === undefined
          ? []
          : [
              {
                url: avatar.url || undefined,
                imageKey: avatar.imageKey ?? avatar.id,
                label: labelFor(avatar.status),
              },
            ],
      isLoading: entity.isLoading,
      isError: entity.isError,
    };
  }

  return NO_IMAGES;
}
