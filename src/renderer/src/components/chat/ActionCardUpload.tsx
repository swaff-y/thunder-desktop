import { useId, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createUploadFlow,
  imageTargetFor,
  toUploadCard,
  type ChatAction,
  type UploadCard,
  type UploadFile,
  type UploadPorts,
  type UploadState,
} from "@swaff-y/thunder-chat-core";
import { fetchEntity, putUpload, requestUploadUrl } from "../../api/halo";
import { useActionImages } from "./useActionImages";

/**
 * The card streams the whole file in one PUT with no resume and no stall
 * watchdog, so it refuses the sizes that need those rather than failing
 * forty minutes in. Big video belongs on the upload page.
 */
const MAX_BYTES = 500 * 1024 * 1024;
const MAX_LABEL = "500 MB";

/** A record's own images are the only ones that can also be video. */
function acceptFor(entityType: string): string {
  return entityType === "record" ? "image/*,video/*" : "image/*";
}

function nounFor(entityType: string): string {
  return entityType === "record" ? "an image or video" : "an image";
}

function subjectFor(target: UploadCard["target"]): string {
  return target.name ?? `this ${target.entityType}`;
}

/** `accept` is a hint the OS picker ignores and a drop bypasses entirely. */
function rejectionFor(file: File, entityType: string): string | undefined {
  const allowsVideo = entityType === "record";
  const isImage = file.type.startsWith("image/");
  const isVideo = allowsVideo && file.type.startsWith("video/");
  if (!isImage && !isVideo) {
    return `${file.name} is not ${nounFor(entityType)}. Nothing was uploaded.`;
  }
  if (file.size > MAX_BYTES) {
    return `${file.name} is larger than ${MAX_LABEL}. Upload it from the record page instead — this card cannot resume a stalled transfer.`;
  }
  return undefined;
}

/**
 * TC-028's upload card: a drop zone, and the five destructive steps behind
 * it run by `createUploadFlow` (TCC-011).
 *
 * The card is handed a target and never a URL, because minting one is not a
 * read. `POST /v1/{entityType}/{id}/upload` clears the picture and bumps
 * `image_version` before a byte arrives, so nothing here touches the network
 * until someone has chosen a file — and it confirms first when there is
 * something to destroy.
 */
export default function ActionCardUpload({
  action,
}: {
  action: ChatAction;
}): React.JSX.Element | null {
  const card = toUploadCard(action);
  if (card === undefined) return null;
  return <UploadCardBody card={card} />;
}

function UploadCardBody({ card }: { card: UploadCard }): React.JSX.Element {
  const { target, title, replacesExisting } = card;
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [isOver, setIsOver] = useState(false);
  const barId = useId();

  const [flow] = useState(() => createUploadFlow({ target, replacesExisting }, HALO_PORTS));
  const state = useSyncExternalStore(flow.subscribe, () => flow.state);

  // Only once the upload is done — reading the entity any earlier would put a
  // request on the wire for a card nobody has touched.
  const imageTarget =
    state.phase === "done" ? imageTargetFor(target.entityType, target.id) : undefined;
  const { slides } = useActionImages(imageTarget);
  const imageUrl = slides.find((slide) => slide.url !== undefined)?.url;

  function settle(next: UploadState): void {
    if (next.phase !== "done") return;
    queryClient.invalidateQueries({
      queryKey:
        target.entityType === "record"
          ? ["record", target.id]
          : ["entity", target.entityType, target.id],
    });
  }

  async function begin(files: FileList | null): Promise<void> {
    const file = files?.[0];
    if (files === null || file === undefined) return;

    const rejection = rejectionFor(file, target.entityType);
    if (rejection !== undefined) {
      setNotice(rejection);
      return;
    }

    setNotice(
      files.length > 1
        ? `Uploading ${file.name}. The other ${files.length - 1} were ignored — one file at a time.`
        : undefined
    );
    settle(await flow.start(file));
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    void begin(event.target.files);
    event.target.value = "";
  }

  function handleDragOver(event: React.DragEvent): void {
    event.preventDefault();
    setIsOver(true);
  }

  function handleDragLeave(): void {
    setIsOver(false);
  }

  function handleDrop(event: React.DragEvent): void {
    event.preventDefault();
    setIsOver(false);
    void begin(event.dataTransfer.files);
  }

  async function handleConfirm(): Promise<void> {
    settle(await flow.confirm());
  }

  function handleCancel(): void {
    flow.cancel();
  }

  async function handleRetry(): Promise<void> {
    settle(await flow.retry());
  }

  return (
    <section className="card-upload" aria-label={title}>
      <header className="card-upload-head">
        <span className="card-upload-kind">Action · upload</span>
        <h3 className="card-upload-title">{title}</h3>
      </header>

      <div className="card-upload-body">
        {(state.phase === "idle" || state.phase === "failed" || state.phase === "cancelled") && (
          <label
            className={isOver ? "card-upload-zone card-upload-zone--over" : "card-upload-zone"}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <span>
              Drop {nounFor(target.entityType)} here, or <strong>choose a file</strong>
            </span>
            <input
              className="visually-hidden"
              type="file"
              accept={acceptFor(target.entityType)}
              onChange={handleChange}
            />
          </label>
        )}

        {state.phase === "confirming" && (
          <>
            <p className="card-upload-warn">
              {subjectFor(target)} already has an image. Uploading replaces it — there is no undo.
            </p>
            <div className="card-upload-actions">
              <button type="button" className="card-upload-danger" onClick={handleConfirm}>
                Replace
              </button>
              <button type="button" className="card-upload-quiet" onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </>
        )}

        {state.phase === "minting" && (
          <p className="card-upload-status" role="status">
            <span className="card-upload-spinner" aria-hidden="true" />
            Preparing…
          </p>
        )}

        {state.phase === "uploading" && (
          <>
            <label className="card-upload-status" htmlFor={barId}>
              Uploading {subjectFor(target)}&apos;s image…
            </label>
            <progress
              id={barId}
              className="card-upload-bar"
              value={state.loaded}
              max={state.total || 1}
            />
            <button type="button" className="card-upload-quiet" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}

        {state.phase === "processing" && (
          <p className="card-upload-status" role="status">
            <span className="card-upload-spinner" aria-hidden="true" />
            Uploaded. Halo is processing it…
          </p>
        )}

        {state.phase === "done" && (
          <>
            {imageUrl !== undefined && (
              <img
                key={state.imageCacheKey ?? imageUrl}
                className="card-upload-image"
                src={imageUrl}
                alt={`${subjectFor(target)}, newly uploaded`}
              />
            )}
            <p className="card-upload-status" role="status">
              Uploaded. {subjectFor(target)} has a new image.
            </p>
          </>
        )}

        {state.phase === "failed" && (
          <div className="card-upload-alert" role="alert">
            <p>{state.message}</p>
            <button type="button" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}

        {state.phase === "cancelled" && (
          <div className="card-upload-alert" role="alert">
            <p>
              {state.at === "confirming"
                ? "Cancelled. Nothing was uploaded."
                : "Cancelled. The old image was already removed. Upload one to replace it."}
            </p>
            <button type="button" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}

        {notice !== undefined && (
          <p className="card-upload-notice" role="alert">
            {notice}
          </p>
        )}
      </div>

      <style>{`
        .card-upload {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }
        .card-upload-head {
          align-items: baseline;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-upload-kind {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-upload-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .card-upload-body {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          padding: var(--space-md);
        }
        .card-upload-zone {
          align-items: center;
          border: 1px dashed var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          cursor: pointer;
          display: flex;
          font-size: var(--text-body-sm);
          justify-content: center;
          min-height: 88px;
          padding: var(--space-md);
          text-align: center;
        }
        .card-upload-zone--over {
          background: var(--color-bg-alt);
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .card-upload-zone:focus-within {
          border-color: var(--color-accent);
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }
        .card-upload-zone strong {
          color: var(--color-accent-light);
          font-weight: var(--weight-semibold);
        }
        .card-upload-warn {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          margin: 0 0 var(--space-sm);
        }
        .card-upload-actions {
          display: flex;
          gap: var(--space-sm);
        }
        .card-upload-status {
          align-items: center;
          color: var(--color-text-muted);
          display: flex;
          font-size: var(--text-body-sm);
          gap: var(--space-sm);
          margin: 0;
        }
        .card-upload-spinner {
          animation: card-upload-spin 0.8s linear infinite;
          border: 2px solid var(--color-border);
          border-radius: 50%;
          border-top-color: var(--color-accent);
          display: inline-block;
          height: 14px;
          width: 14px;
        }
        @keyframes card-upload-spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .card-upload-spinner { animation: none; }
        }
        .card-upload-bar {
          height: 10px;
          width: 100%;
        }
        .card-upload-image {
          border-radius: var(--radius-md);
          display: block;
          max-height: 220px;
          object-fit: cover;
          width: 100%;
        }
        .card-upload-alert {
          color: var(--color-text);
          display: flex;
          flex-direction: column;
          font-size: var(--text-body-sm);
          gap: var(--space-sm);
        }
        .card-upload-alert p {
          margin: 0;
        }
        .card-upload-alert button,
        .card-upload-danger,
        .card-upload-quiet {
          align-self: flex-start;
          background: var(--color-bg-alt);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-text);
          cursor: pointer;
          font-size: var(--text-body-sm);
          padding: var(--space-xs) var(--space-sm);
        }
        .card-upload-danger {
          border-color: var(--color-accent);
          color: var(--color-accent-light);
        }
        .card-upload-notice {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          margin: 0;
        }
      `}</style>
    </section>
  );
}

const HALO_PORTS: UploadPorts = {
  mint: (target, signal) => requestUploadUrl(target.entityType, target.id, signal),
  // `UploadFile` is opaque to the package so React Native can pass its own
  // shape; on the web it is always the `File` the drop zone handed to `start`.
  put: (uploadUrl, file: UploadFile, onProgress, signal) =>
    putUpload(uploadUrl, file as File, onProgress, signal),
  read: (target, signal) =>
    fetchEntity(target.entityType, target.id, signal).then((entity) => ({
      status: entity.status ?? "processing",
      imageKey: entity.imageKey,
      imageVersion: entity.imageVersion,
    })),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
