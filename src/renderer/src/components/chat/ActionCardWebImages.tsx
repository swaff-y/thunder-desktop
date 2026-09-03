import { useState } from "react";
import {
  toWebImagesCard,
  type ChatAction,
  type WebImageCandidate,
} from "@swaff-y/thunder-chat-core";

/** TC-031 returns five; the grid is laid out for that and no more. */
const MAX_TILES = 5;

/** A provider that gave no dimensions gets a square rather than a guess. */
const SQUARE = 1;

/** A page title, not a caption: long enough to overrun a tooltip unread. */
const MAX_TITLE = 100;

function shortTitle(title: string | undefined): string | undefined {
  if (title === undefined || title.length <= MAX_TITLE) return title;
  return `${title.slice(0, MAX_TITLE).trimEnd()}…`;
}

/**
 * TD-077: the pictures the model found on the public web, drawn from the
 * transcript and nothing else.
 *
 * The one card in this app whose images are not Halo's. There is no id to
 * look up, so there is no `useActionImages`, no React Query and no fetch —
 * the URLs arrived with the action and a search costs money, so scrolling
 * the turn back into view re-renders and never re-runs.
 *
 * The hosts are strangers' and rot on their own schedule, so a tile that
 * cannot load removes itself and lets the grid close up around it.
 */
export default function ActionCardWebImages({
  action,
}: {
  action: ChatAction;
}): React.JSX.Element | null {
  const card = toWebImagesCard(action);
  if (card === undefined) return null;

  return (
    <section className="card-web" aria-label={card.title}>
      <header className="card-web-head">
        <span className="card-web-kind">Action · web images</span>
        <h3 className="card-web-title">{card.title}</h3>
        {card.query !== undefined && <span className="card-web-query">“{card.query}”</span>}
      </header>

      <ul className="card-web-grid">
        {card.candidates.slice(0, MAX_TILES).map((candidate) => (
          <WebImageTile key={candidate.imageUrl} candidate={candidate} />
        ))}
      </ul>

      <style>{`
        .card-web {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }
        .card-web-head {
          align-items: baseline;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-web-kind {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-web-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .card-web-query {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          max-width: 40%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .card-web-grid {
          display: grid;
          gap: var(--space-sm);
          grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          list-style: none;
          margin: 0;
          padding: var(--space-md);
        }
        .card-web-tile {
          min-width: 0;
        }
        .card-web-open {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: block;
          overflow: hidden;
          padding: 0;
          width: 100%;
        }
        .card-web-open:hover,
        .card-web-open:focus-visible {
          border-color: var(--color-accent);
        }
        .card-web-img {
          background: var(--color-bg-alt);
          display: block;
          object-fit: cover;
          width: 100%;
        }
        .card-web-host {
          color: var(--color-text-muted);
          display: block;
          font-size: var(--text-caption);
          overflow: hidden;
          padding: var(--space-xs) var(--space-sm);
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </section>
  );
}

/**
 * The tile owns whether its own image loaded: a failure renders nothing at
 * all, which is what lets the grid reflow rather than hold a broken glyph.
 */
function WebImageTile({ candidate }: { candidate: WebImageCandidate }): React.JSX.Element | null {
  const [failed, setFailed] = useState(false);

  function handleError(): void {
    setFailed(true);
  }

  /**
   * A stranger's URL never navigates the renderer. `openExternal` is
   * allowlisted in main (TD-021) and hands the full-size image to the OS.
   */
  function handleOpen(): void {
    void window.thunder?.shell.openExternal(candidate.imageUrl);
  }

  if (failed) return null;

  const label = shortTitle(candidate.title);

  return (
    <li className="card-web-tile">
      <button type="button" className="card-web-open" onClick={handleOpen} title={label}>
        <img
          className="card-web-img"
          src={candidate.thumbnailUrl ?? candidate.imageUrl}
          alt={label ?? ""}
          style={{ aspectRatio: candidate.aspectRatio ?? SQUARE }}
          onError={handleError}
          referrerPolicy="no-referrer"
        />
        <span className="card-web-host">{candidate.sourceHost}</span>
      </button>
    </li>
  );
}
