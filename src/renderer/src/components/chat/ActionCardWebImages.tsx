import { useState } from "react";
import {
  toWebImagesCard,
  type ChatAction,
  type WebImageCandidate,
} from "@swaff-y/thunder-chat-core";
import { useOpenInBrowserTab } from "../../browser/BrowserNavContext";

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
 * The extensions a still thumbnail would flatten. There is no MIME type on
 * the wire, so the path is all the renderer has to go on, and a static
 * `.webp` pays a full-size fetch it did not need until web-mcp sends one.
 */
const ANIMATED_EXTENSIONS = [".gif", ".webp"] as const;

/**
 * TD-082: a search engine re-encodes what it caches, so its thumbnail of a
 * gif is a single frame. The extension lives on the pathname, where a query
 * string cannot hide it; a URL that will not parse is not animated.
 */
function isAnimated(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  return ANIMATED_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

/**
 * The URLs a tile will try, best first: the animated original before the
 * still it would be flattened to, and the cheap thumbnail before the
 * full-resolution bytes everywhere else.
 */
function sourceLadder(candidate: WebImageCandidate): string[] {
  const { imageUrl, thumbnailUrl } = candidate;
  const ordered = isAnimated(imageUrl) ? [imageUrl, thumbnailUrl] : [thumbnailUrl, imageUrl];
  return [...new Set(ordered.filter((url): url is string => url !== undefined))];
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
 * cannot load falls to its next source, and one with none left removes
 * itself and lets the grid close up around it.
 *
 * TD-080: a tile opens in this app's own Browser tab, not the OS browser.
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
 * The tile owns which of its URLs is loading: a failure demotes to the next
 * rung of the ladder, and running off the end renders nothing at all, which
 * is what lets the grid reflow rather than hold a broken glyph.
 */
function WebImageTile({ candidate }: { candidate: WebImageCandidate }): React.JSX.Element | null {
  const [rung, setRung] = useState(0);
  const openInBrowserTab = useOpenInBrowserTab();

  const sources = sourceLadder(candidate);
  const src = sources[rung];

  /** A broken URL can fire onError more than once; only its own rung moves. */
  function handleError(): void {
    setRung((current) => (current === rung ? current + 1 : current));
  }

  /**
   * TD-080: a stranger's URL still never navigates the renderer — it goes
   * to the Browser tab's sandboxed <webview>, which is where the app's
   * Back button, TD-047's Save image and TD-026's download folder live.
   */
  function handleOpen(): void {
    openInBrowserTab(candidate.imageUrl);
  }

  if (src === undefined) return null;

  const label = shortTitle(candidate.title);

  return (
    <li className="card-web-tile">
      <button type="button" className="card-web-open" onClick={handleOpen} title={label}>
        <img
          className="card-web-img"
          src={src}
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
