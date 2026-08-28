import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  IoArrowBack,
  IoContract,
  IoExpand,
  IoHeart,
  IoHeartOutline,
  IoVolumeHigh,
  IoVolumeMute,
} from "react-icons/io5";
import { useCart } from "../hooks/useCart";
import { buildAuthProxyUrl, watchRecord, likeRecord } from "../api/halo";
import VideoPlayer from "../components/shared/VideoPlayer";
import { isMuted, resolveActiveId } from "./multiwatch-audio";

export default function MultiWatch() {
  const { items } = useCart();
  const navigate = useNavigate();
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [requestedAudioId, setRequestedAudioId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const lastExpandedRef = useRef<string | null>(null);

  // Escape is scoped by the guard rather than by mounting: the expanded cell
  // is the same DOM node as the grid cell, so there is no overlay component
  // whose lifecycle could do the scoping. Nothing else here listens for keys,
  // so collapsing is all Escape can ever do — it never reaches Back.
  useEffect(() => {
    if (expandedId === null) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setExpandedId(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expandedId]);

  // Expanding hands the keyboard the cell's own control, which is also where
  // collapsing has to leave it — the same button, relabelled.
  useEffect(() => {
    const collapsedFrom = lastExpandedRef.current;
    lastExpandedRef.current = expandedId;
    const target = expandedId ?? collapsedFrom;
    if (target === null) return;
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-expand-for="${CSS.escape(target)}"]`)
      ?.focus();
  }, [expandedId]);

  if (items.length < 2) {
    return <Navigate to="/" replace />;
  }

  const activeId = resolveActiveId(items.map((item) => item.id), requestedAudioId);

  function handleLike(id: string): void {
    if (likedIds.has(id)) return;
    setLikedIds((prev) => new Set(prev).add(id));
    likeRecord(id).catch(() => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  }

  function handleExpand(id: string): void {
    setRequestedAudioId(id);
    setExpandedId(id);
  }

  const count = items.length;
  const layoutClass =
    count === 2 ? "multi-layout-2" : count === 3 ? "multi-layout-3" : "multi-layout-4";

  return (
    <div className="multi-watch-fullscreen">
      {expandedId === null && (
        <button
          className="multi-back-btn"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <IoArrowBack size={18} />
        </button>
      )}

      <div ref={gridRef} className={`multi-watch-grid ${layoutClass}`}>
        {items.map((item) => {
          const isActive = item.id === activeId;
          const isExpanded = item.id === expandedId;
          const isLiked = likedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`multi-watch-cell${isActive ? " multi-watch-cell--active" : ""}${isExpanded ? " multi-watch-cell--expanded" : ""}`}
              onDoubleClick={() => handleExpand(item.id)}
            >
              <VideoPlayer
                src={buildAuthProxyUrl(item.id)}
                className="multi-watch-player"
                muted={isMuted(item.id, activeId)}
                controls={isExpanded}
                onFirstPlay={() => { watchRecord(item.id).catch(() => {}); }}
              />
              <div className="multi-watch-controls">
                <button
                  className="multi-cell-btn"
                  onClick={() => setRequestedAudioId(item.id)}
                  title={isActive ? "Audio on" : "Audio off"}
                  aria-pressed={isActive}
                  aria-label={`Audio from ${item.name}`}
                >
                  {isActive ? <IoVolumeHigh size={16} /> : <IoVolumeMute size={16} />}
                </button>
                <button
                  data-expand-for={item.id}
                  className="multi-cell-btn"
                  onClick={() => (isExpanded ? setExpandedId(null) : handleExpand(item.id))}
                  title={isExpanded ? "Collapse" : "Expand"}
                  aria-label={isExpanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
                >
                  {isExpanded ? <IoContract size={16} /> : <IoExpand size={16} />}
                </button>
                <button
                  className="multi-cell-btn"
                  onClick={() => handleLike(item.id)}
                  title={isLiked ? "Liked" : "Like"}
                  aria-label={isLiked ? `Liked ${item.name}` : `Like ${item.name}`}
                >
                  {isLiked ? <IoHeart size={16} /> : <IoHeartOutline size={16} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .multi-watch-fullscreen {
          position: fixed;
          inset: 0;
          background: #000;
          z-index: 2000;
        }

        .multi-back-btn {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 2100;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          backdrop-filter: blur(4px);
        }
        .multi-back-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        .multi-watch-grid {
          display: grid;
          gap: 2px;
          height: 100vh;
          width: 100vw;
        }

        .multi-layout-2 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr;
        }

        .multi-layout-3 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }
        .multi-layout-3 .multi-watch-cell:first-child {
          grid-column: 1 / -1;
        }

        .multi-layout-4 {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr 1fr;
        }

        /* Every cell is placed by hand so that taking one out of flow to
           expand it leaves the other three exactly where they were —
           auto-placement would slide them up into the hole and back down
           again on collapse. */
        .multi-layout-2 .multi-watch-cell:nth-child(1) { grid-area: 1 / 1; }
        .multi-layout-2 .multi-watch-cell:nth-child(2) { grid-area: 1 / 2; }

        .multi-layout-3 .multi-watch-cell:nth-child(1) { grid-area: 1 / 1 / 2 / -1; }
        .multi-layout-3 .multi-watch-cell:nth-child(2) { grid-area: 2 / 1; }
        .multi-layout-3 .multi-watch-cell:nth-child(3) { grid-area: 2 / 2; }

        .multi-layout-4 .multi-watch-cell:nth-child(1) { grid-area: 1 / 1; }
        .multi-layout-4 .multi-watch-cell:nth-child(2) { grid-area: 1 / 2; }
        .multi-layout-4 .multi-watch-cell:nth-child(3) { grid-area: 2 / 1; }
        .multi-layout-4 .multi-watch-cell:nth-child(4) { grid-area: 2 / 2; }

        .multi-watch-cell {
          position: relative;
          min-height: 0;
          overflow: hidden;
        }

        /* Inset rather than a real border so marking a cell never changes
           its size and nudges the grid. */
        .multi-watch-cell--active {
          box-shadow: inset 0 0 0 2px var(--color-accent);
        }

        /* Promoted in place: the same element, so the same stream keeps
           playing and nothing re-requests /v1/proxy/:id. */
        .multi-watch-cell--expanded {
          position: fixed;
          inset: 0;
          z-index: 2200;
          background: #000;
        }

        .multi-watch-player {
          height: 100%;
          border-radius: 0;
        }

        /* Top-right, because the native control bar owns the bottom edge of
           an expanded cell and swallows clicks meant for anything over it. */
        .multi-watch-controls {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 2100;
          display: flex;
          gap: 8px;
        }

        .multi-cell-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
          backdrop-filter: blur(4px);
        }
        .multi-cell-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
        .multi-cell-btn[aria-pressed="true"] {
          color: var(--color-accent);
        }

        @media (max-width: 991px) {
          .multi-layout-2 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }
          .multi-layout-2 .multi-watch-cell:nth-child(2) { grid-area: 2 / 1; }
        }
      `}</style>
    </div>
  );
}
