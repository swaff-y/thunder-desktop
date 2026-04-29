import { useState, useEffect } from "react";
import { Card } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { IoAddCircleOutline, IoRemoveCircleOutline } from "react-icons/io5";
import { useCart } from "../../hooks/useCart";
import { useImage } from "../../hooks/useImage";
import { buildImageCacheKey } from "../../utils/imageCacheKey";
import type { ContentRecord, RecordImage } from "../../types";

interface DesktopCardProps {
  record: ContentRecord;
}

const CAROUSEL_INTERVAL = 3000;

interface CardImageProps {
  image: RecordImage;
  alt: string;
  isActive: boolean;
}

// Always-on cache path. Only mounted when we have a stable cache key,
// so the hook is never invoked with an empty id.
function CachedCardImage({
  cacheKey,
  url,
  alt,
  isActive,
}: {
  cacheKey: string;
  url: string;
  alt: string;
  isActive: boolean;
}) {
  const src = useImage(cacheKey, url);
  const className = `carousel-img ${isActive ? "active" : ""}`;
  // While the blob is loading, render an empty div in the same absolute slot
  // so we don't get a broken-image icon. The parent already has the placeholder
  // background (var(--color-bg-alt)) so there's no layout shift.
  if (!src) return <div className={className} aria-hidden="true" />;
  return <img src={src} alt={alt} className={className} />;
}

// Picks between the cached path and a direct presigned-URL fallback.
// Fallback is used when the BE response did not include imageKey — keeps the
// component working against pre-HALO-124 responses or any endpoint that hasn't
// been updated yet.
function CardImage({ image, alt, isActive }: CardImageProps) {
  const cacheKey = buildImageCacheKey(image);
  if (cacheKey) {
    return (
      <CachedCardImage
        cacheKey={cacheKey}
        url={image.url}
        alt={alt}
        isActive={isActive}
      />
    );
  }
  return (
    <img
      src={image.url}
      alt={alt}
      className={`carousel-img ${isActive ? "active" : ""}`}
    />
  );
}

export default function DesktopCard({ record }: DesktopCardProps) {
  const navigate = useNavigate();
  const { add, remove, has, isFull } = useCart();
  const inCart = record.id ? has(record.id) : false;

  const images = (record.images ?? []).slice(0, 4);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, CAROUSEL_INTERVAL);
    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <Card className="desktop-card">
      <div
        className="desktop-card-image"
        onClick={() => navigate(`/watch/${record.id}`)}
      >
        {images.length > 0 ? (
          images.map((img, i) => (
            <CardImage
              key={img.imageKey ?? img.url}
              image={img}
              alt={record.name}
              isActive={i === activeIndex}
            />
          ))
        ) : (
          <div className="desktop-card-placeholder">No Image</div>
        )}
        <div className="desktop-card-overlay">
          <span className="play-icon">&#9654;</span>
        </div>
      </div>
      <Card.Body className="desktop-card-body">
        <h3 className="desktop-card-title">{record.name}</h3>
        <div className="desktop-card-footer">
          <span className="desktop-card-meta">
            {record.series?.name || record.movie?.name || ""}
          </span>
          {record.id && (
            <button
              className={`cart-btn ${inCart ? "in-cart" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                inCart ? remove(record.id) : add(record);
              }}
              disabled={!inCart && isFull}
              title={inCart ? "Remove from queue" : isFull ? "Queue full" : "Add to queue"}
            >
              {inCart ? <IoRemoveCircleOutline size={16} /> : <IoAddCircleOutline size={16} />}
            </button>
          )}
        </div>
      </Card.Body>

      <style>{`
        .desktop-card {
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          overflow: hidden;
          height: 100%;
        }
        .desktop-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        .desktop-card-image {
          position: relative;
          height: 180px;
          overflow: hidden;
          background: var(--color-bg-alt);
        }
        .desktop-card-image .carousel-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 0.8s ease, transform 0.3s;
        }
        .desktop-card-image .carousel-img.active {
          opacity: 1;
        }
        .desktop-card:hover .desktop-card-image .carousel-img {
          transform: scale(1.05);
        }
        .desktop-card-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.3s;
        }
        .desktop-card:hover .desktop-card-overlay {
          opacity: 1;
        }
        .play-icon {
          font-size: 2rem;
          color: white;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }
        .desktop-card-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-faint);
          font-size: var(--text-body-sm);
        }
        .desktop-card-body {
          padding: var(--space-sm) var(--space-md);
        }
        .desktop-card-title {
          font-size: var(--text-body);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .desktop-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 2px;
        }
        .desktop-card-meta {
          font-size: var(--text-caption);
          color: var(--color-text-muted);
        }
        .cart-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          color: var(--color-text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
          padding: 0;
        }
        .cart-btn:hover:not(:disabled) {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
        .cart-btn.in-cart {
          border-color: var(--color-cta);
          color: var(--color-cta);
          background: rgba(244, 63, 94, 0.1);
        }
        .cart-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>
    </Card>
  );
}
