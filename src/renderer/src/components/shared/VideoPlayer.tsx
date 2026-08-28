import { useRef, useCallback, useImperativeHandle, useEffect, type Ref } from "react";

export interface VideoPlayerHandle {
  stop: () => void;
}

interface VideoPlayerProps {
  src: string;
  title?: string;
  className?: string;
  onFirstPlay?: () => void;
  /**
   * MultiWatch grids four of these and only one may be audible, so mute is a
   * prop rather than the element's own business. It is re-asserted from an
   * effect because the native control bar writes the same bit.
   */
  muted?: boolean;
  /** Off for a glanceable grid cell, on everywhere a scrubber makes sense. */
  controls?: boolean;
  ref?: Ref<VideoPlayerHandle>;
}

// TD-046: if the initial fetch to v1/proxy/:id stalls (Chromium's
// per-host socket pool saturated by concurrent downloads), the
// `<video>` element never auto-retries even after sockets free up —
// a manual reload is the only recovery today. Watch the stall/wait
// events and call `load()` to restart the fetch once the stall
// outlasts this debounce. Five seconds is long enough to ignore
// normal buffering pauses on healthy connections.
const STALL_TIMEOUT_MS = 5000;
// Bound retries so a genuinely broken source (404, auth expired)
// doesn't loop forever. The user can still manually reload past this.
const STALL_MAX_RETRIES = 5;

export default function VideoPlayer({
  src,
  title,
  className = "",
  onFirstPlay,
  muted = false,
  controls = true,
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

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let retries = 0;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;

    const clearStallTimer = (): void => {
      if (stallTimer !== null) {
        clearTimeout(stallTimer);
        stallTimer = null;
      }
    };

    const handleStall = (): void => {
      if (stallTimer !== null || retries >= STALL_MAX_RETRIES) return;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        retries++;
        // load() reinitializes the media element's resource selection
        // and restarts the fetch — same effect as the user pressing
        // reload. Leaving src unchanged keeps the visible frame.
        video.load();
      }, STALL_TIMEOUT_MS);
    };

    const handleResume = (): void => {
      clearStallTimer();
      retries = 0;
    };

    video.addEventListener("stalled", handleStall);
    video.addEventListener("waiting", handleStall);
    video.addEventListener("playing", handleResume);
    video.addEventListener("loadeddata", handleResume);

    return (): void => {
      clearStallTimer();
      video.removeEventListener("stalled", handleStall);
      video.removeEventListener("waiting", handleStall);
      video.removeEventListener("playing", handleResume);
      video.removeEventListener("loadeddata", handleResume);
    };
  }, [src]);

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
        muted={muted}
        controls={controls}
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
