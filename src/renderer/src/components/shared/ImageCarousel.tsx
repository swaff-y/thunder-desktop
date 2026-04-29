import { useState, useEffect, useCallback } from "react";
import type { RecordImage } from "../../types";
import { useImage } from "../../hooks/useImage";
import { buildImageCacheKey } from "../../utils/imageCacheKey";

interface ImageCarouselProps {
  images: RecordImage[];
  height?: number | string;
}

// Always-on cache path. Mounted only when a stable cache key exists.
function CachedCarouselImage({
  cacheKey,
  url,
  isActive,
}: {
  cacheKey: string;
  url: string;
  isActive: boolean;
}) {
  const src = useImage(cacheKey, url);
  const className = `carousel-image ${isActive ? "active" : ""}`;
  // The .carousel-image class already handles absolute positioning + opacity
  // transitions for both <img> and <div>, so the loading div drops cleanly into
  // the same slot.
  if (!src) return <div className={className} aria-hidden="true" />;
  return <img src={src} alt="" className={className} />;
}

// Picks between cached and direct rendering. Falls through to a plain <img>
// when imageKey is missing.
function CarouselImage({
  image,
  isActive,
}: {
  image: RecordImage;
  isActive: boolean;
}) {
  const cacheKey = buildImageCacheKey(image);
  if (cacheKey) {
    return (
      <CachedCarouselImage
        cacheKey={cacheKey}
        url={image.url}
        isActive={isActive}
      />
    );
  }
  return (
    <img
      src={image.url}
      alt=""
      className={`carousel-image ${isActive ? "active" : ""}`}
    />
  );
}

export default function ImageCarousel({
  images,
  height = 240,
}: ImageCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextImage = useCallback(() => {
    if (images.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }
  }, [images.length]);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(nextImage, 3000);
    return () => clearInterval(timer);
  }, [nextImage, images.length]);

  if (!images.length) {
    return (
      <div
        className="carousel-placeholder"
        style={{ height: typeof height === "number" ? `${height}px` : height }}
      >
        <span>No Image</span>
      </div>
    );
  }

  return (
    <div
      className="image-carousel"
      style={{ height: typeof height === "number" ? `${height}px` : height }}
    >
      {images.map((img, i) => (
        <CarouselImage
          key={img.imageKey ?? img.url}
          image={img}
          isActive={i === currentIndex}
        />
      ))}

      <style>{`
        .image-carousel {
          position: relative;
          overflow: hidden;
          border-radius: var(--radius-md);
          background: var(--color-bg-alt);
        }
        .carousel-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 1s ease;
        }
        .carousel-image.active {
          opacity: 1;
        }
        .carousel-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-bg-alt);
          border-radius: var(--radius-md);
          color: var(--color-text-faint);
          font-size: var(--text-body-sm);
        }
      `}</style>
    </div>
  );
}
