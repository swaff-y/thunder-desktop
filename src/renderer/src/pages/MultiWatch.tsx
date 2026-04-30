import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { IoArrowBack, IoHeartOutline, IoHeart } from "react-icons/io5";
import { useCart } from "../hooks/useCart";
import { buildAuthProxyUrl, watchRecord, likeRecord } from "../api/halo";
import VideoPlayer from "../components/shared/VideoPlayer";

export default function MultiWatch() {
  const { items } = useCart();
  const navigate = useNavigate();
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  if (items.length < 2) {
    return <Navigate to="/" replace />;
  }

  const handleLike = (id: string) => {
    if (likedIds.has(id)) return;
    setLikedIds((prev) => new Set(prev).add(id));
    likeRecord(id).catch(() => {
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  const count = items.length;
  const layoutClass =
    count === 2 ? "multi-layout-2" : count === 3 ? "multi-layout-3" : "multi-layout-4";

  return (
    <div className="multi-watch-fullscreen">
      <button
        className="multi-back-btn"
        onClick={() => navigate(-1)}
        aria-label="Back"
      >
        <IoArrowBack size={18} />
      </button>

      <div className={`multi-watch-grid ${layoutClass}`}>
        {items.map((item) => (
          <div key={item.id} className="multi-watch-cell">
            <VideoPlayer
              src={buildAuthProxyUrl(item.id)}
              className="multi-watch-player"
              onFirstPlay={() => { watchRecord(item.id).catch(() => {}); }}
            />
            <button
              className="multi-like-btn"
              onClick={() => handleLike(item.id)}
              title={likedIds.has(item.id) ? "Liked" : "Like"}
            >
              {likedIds.has(item.id) ? (
                <IoHeart size={16} />
              ) : (
                <IoHeartOutline size={16} />
              )}
            </button>
          </div>
        ))}
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

        .multi-watch-cell {
          position: relative;
          min-height: 0;
          overflow: hidden;
        }

        .multi-watch-player {
          height: 100%;
          border-radius: 0;
        }

        .multi-like-btn {
          position: absolute;
          bottom: 12px;
          right: 12px;
          z-index: 2100;
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
        .multi-like-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        @media (max-width: 991px) {
          .multi-layout-2 {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}
