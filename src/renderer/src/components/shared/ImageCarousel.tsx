import { useState, useEffect, useCallback } from "react";

/**
 * A slide is not always a picture: TD-058 draws a record's unprocessed
 * image slots in place so the dot count still matches the record. A slide
 * without a `url` renders its `label` instead of a broken image.
 *
 * `RecordImage` satisfies this shape, so existing callers pass unchanged.
 */
export interface CarouselImage {
  url?: string;
  imageKey?: string;
  label?: string;
}

interface ImageCarouselProps {
  images: CarouselImage[];
  height?: number | string;
  /**
   * Default `true` so the pages that had no say in this keep the 3s
   * rotation they were written against; a chat transcript opts out.
   */
  autoAdvance?: boolean;
  showControls?: boolean;
  /**
   * TD-069: the slide on screen, when something outside is driving it —
   * the expanded record's thumbnail rail. Supply both or neither: with no
   * `index` the carousel keeps its own, which is what every page using it
   * already relies on.
   */
  index?: number;
  onIndexChange?: (index: number) => void;
}

function toCssLength(height: number | string): string {
  return typeof height === "number" ? `${height}px` : height;
}

/** A slot placeholder has neither key nor URL, so position is the tiebreak. */
function slideKey(image: CarouselImage, index: number): string {
  return image.imageKey ?? image.url ?? `slide-${index}`;
}

function Slide({ image, isActive }: { image: CarouselImage; isActive: boolean }) {
  const className = `carousel-image ${isActive ? "active" : ""}`;

  if (!image.url) {
    return (
      <span className={`${className} carousel-slot`}>
        {image.label ?? "No image"}
      </span>
    );
  }
  return <img src={image.url} alt="" className={className} />;
}

export default function ImageCarousel({
  images,
  height = 240,
  autoAdvance = true,
  showControls = false,
  index,
  onIndexChange,
}: ImageCarouselProps) {
  const [ownIndex, setOwnIndex] = useState(0);
  const isControlled = index !== undefined;
  const currentIndex = isControlled ? index : ownIndex;

  // One setter for both modes, so nothing below has to know which it is.
  const goTo = useCallback(
    (next: number) => {
      if (!isControlled) setOwnIndex(next);
      onIndexChange?.(next);
    },
    [isControlled, onIndexChange]
  );

  const advance = useCallback(
    (step: number) => {
      goTo((currentIndex + step + images.length) % images.length);
    },
    [goTo, currentIndex, images.length]
  );

  useEffect(() => {
    if (!autoAdvance || images.length <= 1) return;
    const timer = setInterval(() => advance(1), 3000);
    return () => clearInterval(timer);
  }, [autoAdvance, advance, images.length]);

  if (!images.length) {
    return (
      <div className="carousel-placeholder" style={{ height: toCssLength(height) }}>
        <span>No Image</span>
      </div>
    );
  }

  // `currentIndex` can outlive a shorter `images` — clamp during render
  // rather than resetting it from an effect one frame later.
  const activeIndex = Math.min(currentIndex, images.length - 1);

  function handlePrevious() {
    advance(-1);
  }

  function handleNext() {
    advance(1);
  }

  return (
    <div className="image-carousel" style={{ height: toCssLength(height) }}>
      {images.map((img, i) => (
        <Slide
          key={slideKey(img, i)}
          image={img}
          isActive={i === activeIndex}
        />
      ))}

      {showControls && images.length > 1 && (
        <>
          <button
            type="button"
            className="carousel-arrow carousel-arrow--prev"
            onClick={handlePrevious}
          >
            <span aria-hidden="true">‹</span>
            <span className="visually-hidden">Previous image</span>
          </button>
          <button
            type="button"
            className="carousel-arrow carousel-arrow--next"
            onClick={handleNext}
          >
            <span aria-hidden="true">›</span>
            <span className="visually-hidden">Next image</span>
          </button>
          <div className="carousel-dots">
            {images.map((img, i) => (
              <button
                key={slideKey(img, i)}
                type="button"
                className={`carousel-dot ${i === activeIndex ? "active" : ""}`}
                aria-current={i === activeIndex}
                onClick={() => goTo(i)}
              >
                <span className="visually-hidden">
                  Image {i + 1} of {images.length}
                  {img.label === undefined ? "" : `: ${img.label}`}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

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
        .carousel-slot {
          align-items: center;
          color: var(--color-text-faint);
          display: flex;
          font-size: var(--text-body-sm);
          justify-content: center;
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
        .carousel-arrow {
          align-items: center;
          background: rgba(0, 0, 0, 0.45);
          border: none;
          border-radius: var(--radius-full);
          color: #fff;
          cursor: pointer;
          display: flex;
          font-size: var(--text-body);
          height: 32px;
          justify-content: center;
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 32px;
        }
        .carousel-arrow--prev { left: var(--space-sm); }
        .carousel-arrow--next { right: var(--space-sm); }
        .carousel-dots {
          bottom: var(--space-sm);
          display: flex;
          gap: var(--space-xs);
          justify-content: center;
          left: 0;
          position: absolute;
          right: 0;
        }
        .carousel-dot {
          background: rgba(255, 255, 255, 0.45);
          border: none;
          border-radius: var(--radius-full);
          cursor: pointer;
          height: 8px;
          padding: 0;
          width: 8px;
        }
        .carousel-dot.active {
          background: #fff;
        }
      `}</style>
    </div>
  );
}
