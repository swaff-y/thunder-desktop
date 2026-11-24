import { Link } from "react-router-dom";
import { useEntity } from "../../hooks/useEntity";
import { processedImageUrl } from "../../types";
import type { RecordRef } from "../../types";
import { catalogueRoute } from "../chat/entity-routes";

interface FranchiseChipProps {
  franchise: RecordRef;
}

export default function FranchiseChip({ franchise }: FranchiseChipProps) {
  const { data: entity } = useEntity("franchise", franchise.id);
  const to = catalogueRoute("franchise", franchise.id);
  if (!to) return null;

  const avatarUrl = entity && processedImageUrl(entity);

  return (
    <>
      <Link
        to={to}
        aria-label={`Franchise: ${franchise.name}`}
        className="franchise-chip"
      >
        <span className="franchise-chip-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" />
          ) : (
            franchise.name.charAt(0).toUpperCase()
          )}
        </span>
        <span className="franchise-chip-name">{franchise.name}</span>
      </Link>
      <style>{`
        .franchise-chip {
          display: inline-flex;
          align-items: center;
          gap: var(--space-sm);
          min-width: 0;
          max-width: 100%;
          font-size: var(--text-body-sm);
          color: var(--color-accent);
          text-decoration: none;
        }
        .franchise-chip:hover {
          color: var(--color-accent-light);
        }
        .franchise-chip-avatar {
          flex: none;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-surface);
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          font-weight: var(--weight-semibold);
        }
        .franchise-chip-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .franchise-chip-name {
          min-width: 0;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
      `}</style>
    </>
  );
}
