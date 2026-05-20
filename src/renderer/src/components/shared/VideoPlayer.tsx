import { useRef, useCallback, useImperativeHandle, type Ref } from "react";

export interface VideoPlayerHandle {
  stop: () => void;
}

interface VideoPlayerProps {
  src: string;
  title?: string;
  className?: string;
  onFirstPlay?: () => void;
  ref?: Ref<VideoPlayerHandle>;
}

export default function VideoPlayer({
  src,
  title,
  className = "",
  onFirstPlay,
  ref,
}: VideoPlayerProps) {
  const firedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handlePlay = useCallback(() => {
    if (!firedRef.current && onFirstPlay) {
      firedRef.current = true;
      onFirstPlay();
    }
  }, [onFirstPlay]);

  useImperativeHandle(ref, () => ({
    stop() {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      // Clearing src + load() tears the media element down so Chromium
      // closes the in-flight range request to v1/proxy/:id. Pause alone
      // leaves the connection open.
      video.removeAttribute("src");
      video.load();
    },
  }), []);

  return (
    <div className={`video-player-wrapper ${className}`}>
      {title && (
        <div className="video-title-overlay">
          <h3>{title}</h3>
        </div>
      )}
      <video
        ref={videoRef}
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
