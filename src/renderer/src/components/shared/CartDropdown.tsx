import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { IoListOutline, IoCloseCircleOutline } from "react-icons/io5";
import { useCart } from "../../hooks/useCart";
import { useImage } from "../../hooks/useImage";
import { buildImageCacheKey } from "../../utils/imageCacheKey";
import type { RecordImage } from "../../types";

// Always-on cache path. Mounted only when a stable cache key exists.
function CachedThumbImage({ cacheKey, url }: { cacheKey: string; url: string }) {
  const src = useImage(cacheKey, url);
  if (!src) return <div className="cart-item-thumb-loading" aria-hidden="true" />;
  return <img src={src} alt="" />;
}

// Picks between cached and direct rendering. Falls through to a plain <img>
// when imageKey is missing.
function ThumbImage({ image }: { image: RecordImage }) {
  const cacheKey = buildImageCacheKey(image);
  if (cacheKey) {
    return <CachedThumbImage cacheKey={cacheKey} url={image.url} />;
  }
  return <img src={image.url} alt="" />;
}

export default function CartDropdown() {
  const [open, setOpen] = useState(false);
  const { items, remove, clear, canWatch } = useCart();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="cart-dropdown" ref={ref}>
      <button
        className="cart-trigger"
        onClick={() => setOpen(!open)}
        aria-label="Watch queue"
      >
        <IoListOutline size={20} />
        {items.length > 0 && (
          <span className="cart-badge">{items.length}</span>
        )}
      </button>

      {open && (
        <div className="cart-panel">
          <div className="cart-header">
            <span className="cart-title">Queue ({items.length}/4)</span>
            {items.length > 0 && (
              <button className="cart-clear" onClick={clear}>
                Clear
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="cart-empty">Add records to watch together</p>
          ) : (
            <ul className="cart-list">
              {items.map((item) => (
                <li key={item.id} className="cart-item">
                  <div className="cart-item-thumb">
                    {item.images?.[0]?.url ? (
                      <ThumbImage image={item.images[0]} />
                    ) : (
                      <div className="cart-item-no-img" />
                    )}
                  </div>
                  <span className="cart-item-name">{item.name}</span>
                  <button
                    className="cart-item-remove"
                    onClick={() => remove(item.id)}
                    aria-label="Remove"
                  >
                    <IoCloseCircleOutline size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="cart-watch-btn"
            disabled={!canWatch}
            onClick={() => {
              setOpen(false);
              navigate("/multi-watch");
            }}
          >
            Watch {items.length} Together
          </button>
        </div>
      )}

      <style>{`
        .cart-dropdown {
          position: relative;
        }
        .cart-trigger {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          color: var(--color-text);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s;
        }
        .cart-trigger:hover {
          background: var(--color-surface-light);
        }
        .cart-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--color-accent);
          color: #fff;
          font-size: 11px;
          font-weight: var(--weight-bold);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cart-panel {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 280px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-floating);
          z-index: 1300;
          padding: var(--space-sm);
        }
        .cart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: var(--space-sm);
          border-bottom: 1px solid var(--color-border);
          margin-bottom: var(--space-sm);
        }
        .cart-title {
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
        }
        .cart-clear {
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          cursor: pointer;
          padding: 0;
        }
        .cart-clear:hover {
          color: var(--color-cta);
        }
        .cart-empty {
          color: var(--color-text-faint);
          font-size: var(--text-caption);
          text-align: center;
          padding: var(--space-md) 0;
          margin: 0;
        }
        .cart-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 200px;
          overflow-y: auto;
        }
        .cart-item {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: 4px;
          border-radius: var(--radius-sm);
        }
        .cart-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .cart-item-thumb {
          width: 36px;
          height: 36px;
          border-radius: 4px;
          overflow: hidden;
          flex-shrink: 0;
          background: var(--color-bg-alt);
        }
        .cart-item-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .cart-item-thumb-loading {
          width: 100%;
          height: 100%;
          background: var(--color-bg-alt);
        }
        .cart-item-no-img {
          width: 100%;
          height: 100%;
          background: var(--color-bg-alt);
        }
        .cart-item-name {
          flex: 1;
          font-size: var(--text-caption);
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cart-item-remove {
          background: none;
          border: none;
          color: var(--color-text-faint);
          cursor: pointer;
          padding: 0;
          display: flex;
          flex-shrink: 0;
        }
        .cart-item-remove:hover {
          color: var(--color-cta);
        }
        .cart-watch-btn {
          width: 100%;
          margin-top: var(--space-sm);
          padding: 8px;
          border: none;
          border-radius: var(--radius-xl);
          background: var(--color-accent);
          color: #fff;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          cursor: pointer;
          transition: background 0.2s;
        }
        .cart-watch-btn:hover:not(:disabled) {
          background: var(--color-accent-light);
        }
        .cart-watch-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
