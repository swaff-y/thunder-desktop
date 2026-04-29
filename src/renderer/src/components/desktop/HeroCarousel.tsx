import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { ContentRecord } from "../../types";

interface HeroCarouselProps {
  records: ContentRecord[];
}

export default function HeroCarousel({ records }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();
  const featured = records.slice(0, 5);

  const next = useCallback(() => {
    if (featured.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % featured.length);
    }
  }, [featured.length]);

  useEffect(() => {
    if (featured.length <= 1) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next, featured.length]);

  if (!featured.length) return null;

  const current = featured[currentIndex];
  const imageUrl = current.images?.[0]?.url;

  return (
    <div className="hero-carousel">
      <div
        className="hero-backdrop"
        style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : "none" }}
      />
      <div className="hero-content">
        <h1 className="hero-title">{current.name}</h1>
        <div className="hero-meta">
          {current.series && (
            <span className="hero-tag">{current.series.name}</span>
          )}
        </div>
        <button
          className="hero-play-btn"
          onClick={() => navigate(`/watch/${current.id}`)}
        >
          &#9654; Play
        </button>
      </div>

      <div className="hero-dots">
        {featured.map((_, i) => (
          <button
            key={i}
            className={`hero-dot ${i === currentIndex ? "active" : ""}`}
            onClick={() => setCurrentIndex(i)}
          />
        ))}
      </div>

      <style>{`
        .hero-carousel {
          position: relative;
          height: 400px;
          border-radius: var(--radius-lg);
          overflow: hidden;
          margin-bottom: var(--space-xl);
        }
        .hero-backdrop {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          filter: brightness(0.4);
          transition: background-image 0.5s;
        }
        .hero-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          height: 100%;
          padding: var(--space-xl);
        }
        .hero-title {
          font-size: var(--text-hero);
          font-weight: var(--weight-extrabold);
          color: var(--color-text);
          letter-spacing: var(--tracking-tight);
          margin-bottom: var(--space-sm);
        }
        .hero-play-btn {
          margin-top: var(--space-md);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: var(--color-text);
          font-size: var(--text-body-sm);
          font-weight: var(--weight-medium);
          padding: 6px 16px;
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: background 0.2s;
          width: fit-content;
        }
        .hero-play-btn:hover {
          background: rgba(255, 255, 255, 0.22);
        }
        .hero-meta {
          display: flex;
          gap: var(--space-sm);
        }
        .hero-tag {
          font-size: var(--text-body-sm);
          color: var(--color-text-muted);
          background: rgba(255, 255, 255, 0.1);
          padding: 2px var(--space-sm);
          border-radius: var(--radius-sm);
        }
        .hero-dots {
          position: absolute;
          bottom: var(--space-md);
          right: var(--space-xl);
          display: flex;
          gap: var(--space-sm);
          z-index: 2;
        }
        .hero-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          transition: background 0.2s;
          padding: 0;
        }
        .hero-dot.active {
          background: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
