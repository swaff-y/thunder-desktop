import { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { IoHeartOutline, IoHeart } from "react-icons/io5";
import { useRecord } from "../hooks/useRecord";
import {
  buildAuthProxyUrl,
  watchRecord,
  likeRecord,
  updateRecord,
} from "../api/halo";
import type { RecordPatchBody } from "../types";
import VideoPlayer from "../components/shared/VideoPlayer";
import ContentTable from "../components/shared/ContentTable";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: record, isLoading, isError, error, refetch } = useRecord(id!);
  const [liked, setLiked] = useState(false);
  const watchedRef = useRef(false);

  const handleFirstPlay = useCallback(() => {
    if (watchedRef.current) return;
    watchedRef.current = true;
    watchRecord(id!).catch(() => {});
  }, [id]);

  if (isLoading) return <LoadingSpinner fullScreen message="Loading..." />;
  if (isError || !record)
    return (
      <ErrorState
        message={error?.message || "Failed to load record"}
        onRetry={() => refetch()}
      />
    );

  const authUrl = buildAuthProxyUrl(id!);

  const handleLike = () => {
    if (liked) return;
    setLiked(true);
    likeRecord(id!).catch(() => setLiked(false));
  };

  const handleUpdate = async (body: RecordPatchBody) => {
    await updateRecord(id!, body);
    queryClient.invalidateQueries({ queryKey: ["record", id] });
  };

  return (
    <div className="watch-desktop">
      <div className="watch-player-container">
        <VideoPlayer
          src={authUrl}
          title={record.name}
          className="watch-player-desktop"
          onFirstPlay={handleFirstPlay}
        />
      </div>
      <div className="watch-info-desktop">
        <div className="watch-title-row">
          <h2 className="watch-title-desktop">{record.name}</h2>
          <button
            className="discrete-btn"
            onClick={handleLike}
            title={liked ? "Liked" : "Like"}
          >
            {liked ? <IoHeart size={18} /> : <IoHeartOutline size={18} />}
          </button>
        </div>
        <ContentTable record={record} onUpdate={handleUpdate} />
      </div>

      <style>{`
        .watch-desktop {
          max-width: 1200px;
          margin: 0 auto;
        }
        .watch-player-container {
          margin-bottom: var(--space-lg);
        }
        .watch-player-desktop {
          height: 70vh;
          max-height: 700px;
        }
        .watch-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-md);
        }
        .watch-title-desktop {
          font-size: var(--text-h1);
          font-weight: var(--weight-bold);
          color: var(--color-text);
          margin: 0;
        }
        .watch-info-desktop {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
        }
        .discrete-btn {
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
        .discrete-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
