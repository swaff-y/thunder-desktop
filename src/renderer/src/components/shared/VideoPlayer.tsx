import { useRef, useCallback } from "react";

interface VideoPlayerProps {
  src: string;
  title?: string;
  className?: string;
  onFirstPlay?: () => void;
}

export default function VideoPlayer({
  src,
  title,
  className = "",
  onFirstPlay,
}: VideoPlayerProps) {
  const firedRef = useRef(false);

  const handlePlay = useCallback(() => {
    if (!firedRef.current && onFirstPlay) {
      firedRef.current = true;
      onFirstPlay();
    }
  }, [onFirstPlay]);

  return (
    <div className={`video-player-wrapper ${className}`}>
      {title && (
        <div className="video-title-overlay">
          <h3>{title}</h3>
        </div>
      )}
      <video
        className="video-element"
        src={src}
        controls
        autoPlay
        loop
        playsInline
        onPlay={handlePlay}
      />

      <style>{`
        .video-player-wrapper {
          position: relative;
          background: #000;
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        .video-title-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          background: var(--color-overlay);
          padding: var(--space-sm) var(--space-md);
          z-index: 1;
        }
        .video-title-overlay h3 {
          margin: 0;
          font-size: var(--text-h3);
          color: var(--color-text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .video-element {
          width: 100%;
          height: 100%;
          object-fit: contain;
          display: block;
        }
      `}</style>
    </div>
  );
}
