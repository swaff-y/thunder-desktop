import type { ListRow } from "./list-adapters";
import { useActionImages } from "./useActionImages";

/**
 * TD-058 fills TD-057's row slot: the thumbnail is fetched by id like
 * every other picture in the chat, so a restored transcript shows live
 * images rather than the presigned URLs the action never carried.
 */
export default function ActionRowImage({ row }: { row: ListRow }): React.JSX.Element | null {
  const { slides } = useActionImages(row.image);
  const url = slides.find((slide) => slide.url !== undefined)?.url;
  if (url === undefined) return null;

  return (
    <>
      <img className="card-list-thumb" src={url} alt="" />
      <style>{`
        .card-list-thumb {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }
      `}</style>
    </>
  );
}
