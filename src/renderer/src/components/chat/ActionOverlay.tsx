import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { ChatAction, ListCard, ListRow, SingleCard } from "@swaff-y/thunder-chat-core";
import { toListCard, toSingleCard } from "@swaff-y/thunder-chat-core";
import ImageCarousel from "../shared/ImageCarousel";
import ActionRowImage from "./ActionRowImage";
import { APP_ROUTES } from "./entity-routes";
import { ChipSection, useCopyId } from "./record-parts";
import { useActionImages } from "./useActionImages";

/**
 * TD-069: one action, filling the drawer.
 *
 * The inline cards are deliberately small — six rows of a page, one slide
 * of a record — and until now that was all there was. This is the rest of
 * it: the same action with room, drawn over the transcript rather than
 * beside it, so `Close` puts the reader back exactly where they were.
 *
 * `position: absolute; inset: 0` inside the panel, not the window: the
 * drawer's own header stays reachable, which is what keeps `Widen` working
 * while the overlay is open.
 */

const CAROUSEL_HEIGHT = 300;

function OverlayList({ card }: { card: ListCard }): React.JSX.Element {
  if (card.rows.length === 0) {
    return <p className="action-overlay-empty">{card.emptyMessage}</p>;
  }

  return (
    <>
      <table className="action-overlay-table">
        <thead>
          <tr>
            <th scope="col">Image</th>
            <th scope="col">Name</th>
            <th scope="col">Actors</th>
            <th scope="col" className="action-overlay-metric">
              {card.metricLabel}
            </th>
            <th scope="col">
              <span className="visually-hidden">Link</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row: ListRow) => (
            <tr key={row.key}>
              <td>
                <span className="action-overlay-image" aria-hidden="true">
                  <ActionRowImage row={row} />
                </span>
              </td>
              <td>
                <span className="action-overlay-name">{row.name}</span>
                <code className="action-overlay-id">{row.id}</code>
              </td>
              <td className="action-overlay-secondary">{row.secondary ?? "—"}</td>
              <td className="action-overlay-metric mono">
                {row.metric === null ? "—" : row.metric.toLocaleString()}
              </td>
              <td>
                {row.cta !== undefined && (
                  <Link
                    className="action-overlay-cta"
                    to={row.cta.to}
                    aria-label={`${row.cta.label}: ${row.name}`}
                  >
                    {row.cta.label}
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="action-overlay-foot">
        <span>
          {card.rows.length < card.total
            ? `Showing ${card.rows.length} of ${card.total}`
            : `${card.total} ${card.total === 1 ? "result" : "results"}`}
        </span>
        {card.note !== undefined && <span>{card.note}</span>}
        {card.hasMore && <span>more available</span>}
      </footer>
    </>
  );
}

function OverlaySingle({ card }: { card: SingleCard }): React.JSX.Element {
  const images = useActionImages(card.image);
  const { copied, copy } = useCopyId(card.id);
  const [slide, setSlide] = useState(0);

  const slides = images.slides;
  // The rail clamps with the carousel: a shorter set of slides must not
  // leave the outline pointing at a slot that is no longer there.
  const current = slides.length === 0 ? 0 : Math.min(slide, slides.length - 1);

  return (
    <>
      {card.image !== undefined && (
        <div className="action-overlay-stage">
          <div className="action-overlay-carousel">
            <ImageCarousel
              images={
                images.isError
                  ? [{ label: "Image unavailable" }]
                  : images.isLoading
                    ? [{ label: "Loading image…" }]
                    : slides
              }
              height={CAROUSEL_HEIGHT}
              autoAdvance={false}
              showControls
              index={current}
              onIndexChange={setSlide}
            />
          </div>
          {slides.length > 1 && (
            <ul className="action-overlay-rail" aria-label="Image slots">
              {slides.map((image, i) => (
                <li key={image.imageKey ?? `slot-${i}`}>
                  <button
                    type="button"
                    className={`action-overlay-thumb${i === current ? " action-overlay-thumb--current" : ""}`}
                    aria-current={i === current}
                    onClick={() => setSlide(i)}
                  >
                    {image.url === undefined ? (
                      <span className="action-overlay-thumb-slot">
                        {image.label ?? "No image"}
                      </span>
                    ) : (
                      <img src={image.url} alt="" />
                    )}
                    <span className="visually-hidden">
                      Image {i + 1} of {slides.length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="action-overlay-titles">
        <h3 className="action-overlay-record-name">{card.name}</h3>
        <code className="action-overlay-id">{card.id}</code>
      </div>

      <div className="action-overlay-actions">
        <button type="button" className="action-overlay-btn" onClick={copy}>
          Copy ID
        </button>
        {card.route !== undefined && (
          <Link className="action-overlay-btn" to={card.route}>
            Open in catalogue
          </Link>
        )}
        <span className="action-overlay-copied" role="status">
          {copied ? "ID copied" : ""}
        </span>
      </div>

      <ChipSection heading="Actors" chips={card.cast} />
      <ChipSection heading="Tags" chips={card.tags} />
    </>
  );
}

export default function ActionOverlay({
  action,
  previousList,
  onClose,
}: {
  action: ChatAction;
  /** The list this single came out of, when it came out of one. */
  previousList?: ChatAction;
  onClose: () => void;
}): React.JSX.Element | null {
  const [showList, setShowList] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Opening hands the keyboard the overlay; closing hands it back to the
  // `Expand` button that opened it, which is still in the transcript
  // underneath. Both fall out of the lifecycle because the overlay is
  // mounted only while it is open.
  useEffect(() => {
    const opener = document.activeElement;
    overlayRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  // Escape closes the overlay and nothing else. The drawer listens on
  // `document`, so the event has to be stopped here or the first Escape
  // would take the whole drawer with it.
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  }

  const shown = showList && previousList !== undefined ? previousList : action;
  const canGoBack = action.kind === "single" && previousList !== undefined && !showList;

  // The header names the card, not the action: the action carries the raw
  // tool call, and the adapters are what turn it into a sentence.
  const list = shown.kind === "list" ? toListCard(shown, APP_ROUTES) : null;
  const single = shown.kind === "single" ? toSingleCard(shown, APP_ROUTES) : null;
  const head = list
    ? { kind: "list", title: list.title, tool: list.tool }
    : single
      ? { kind: single.entityLabel, title: single.name, tool: single.tool }
      : null;
  if (head === null) return null;

  return (
    <div
      ref={overlayRef}
      className="action-overlay"
      role="dialog"
      aria-label={head.title}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <header className="action-overlay-head">
        {/* A list is titled in its header and a record in its body, exactly
            as the two inline cards title themselves. */}
        <span className={`action-overlay-kind${list ? "" : " action-overlay-kind--only"}`}>
          Action · {head.kind}
        </span>
        {list && <h2 className="action-overlay-title">{head.title}</h2>}
        <code className="action-overlay-tool">{head.tool}</code>
        {canGoBack && (
          <button
            type="button"
            className="action-overlay-btn"
            onClick={() => setShowList(true)}
          >
            Back to list
          </button>
        )}
        <button type="button" className="action-overlay-btn" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="action-overlay-body">
        {list ? <OverlayList card={list} /> : single && <OverlaySingle card={single} />}
      </div>

      <style>{`
        .action-overlay {
          background: var(--color-surface);
          box-shadow: -18px 0 44px rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          inset: 0;
          position: absolute;
          z-index: 1;
        }
        .action-overlay:focus {
          outline: none;
        }
        .action-overlay-head {
          align-items: center;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex: none;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .action-overlay-kind {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .action-overlay-kind--only {
          flex: 1;
        }
        .action-overlay-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          margin: 0;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .action-overlay-tool {
          color: var(--color-accent-light);
          font-size: var(--text-caption);
        }
        .action-overlay-btn {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
          text-decoration: none;
          white-space: nowrap;
        }
        .action-overlay-btn:hover {
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .action-overlay-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: var(--space-md);
        }
        /* Five columns fit the drawer at both its widths, so the table lays
           itself out rather than scrolling sideways: the name column takes
           whatever the fixed ones leave. */
        .action-overlay-table {
          border-collapse: collapse;
          font-size: var(--text-body-sm);
          table-layout: auto;
          width: 100%;
        }
        .action-overlay-table th {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          font-weight: var(--weight-medium);
          letter-spacing: 0.08em;
          padding: var(--space-xs) var(--space-sm);
          text-align: left;
          text-transform: uppercase;
        }
        .action-overlay-table td {
          border-top: 1px solid var(--color-border);
          color: var(--color-text);
          padding: var(--space-sm);
          vertical-align: middle;
        }
        .action-overlay-image {
          background: var(--color-bg-alt);
          border-radius: var(--radius-sm);
          display: block;
          height: 40px;
          overflow: hidden;
          width: 40px;
        }
        .action-overlay-name {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .action-overlay-id {
          color: var(--color-text-faint);
          font-size: var(--text-caption);
        }
        .action-overlay-secondary {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
        }
        .action-overlay-metric {
          text-align: right;
          white-space: nowrap;
        }
        .action-overlay-cta {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
          text-decoration: none;
          white-space: nowrap;
        }
        .action-overlay-cta:hover {
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .action-overlay-empty,
        .action-overlay-foot {
          color: var(--color-text-muted);
          display: flex;
          font-size: var(--text-caption);
          gap: var(--space-md);
          margin: var(--space-sm) 0 0;
        }
        .action-overlay-stage {
          display: flex;
          gap: var(--space-md);
        }
        .action-overlay-carousel {
          flex: 1;
          min-width: 0;
        }
        .action-overlay-rail {
          display: flex;
          flex: none;
          flex-direction: column;
          gap: var(--space-sm);
          list-style: none;
          margin: 0;
          max-height: ${CAROUSEL_HEIGHT}px;
          overflow-y: auto;
          padding: 0;
          width: 96px;
        }
        .action-overlay-thumb {
          background: var(--color-bg-alt);
          border: 2px solid transparent;
          border-radius: var(--radius-sm);
          cursor: pointer;
          display: block;
          height: 64px;
          overflow: hidden;
          padding: 0;
          width: 100%;
        }
        .action-overlay-thumb--current {
          border-color: var(--color-accent);
        }
        .action-overlay-thumb img {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }
        .action-overlay-thumb-slot {
          align-items: center;
          color: var(--color-text-faint);
          display: flex;
          font-size: var(--text-caption);
          height: 100%;
          justify-content: center;
          padding: var(--space-xs);
          text-align: center;
        }
        .action-overlay-titles {
          padding-top: var(--space-md);
        }
        .action-overlay-record-name {
          color: var(--color-text);
          font-size: 21px;
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .action-overlay-actions {
          align-items: center;
          display: flex;
          gap: var(--space-sm);
          padding-top: var(--space-md);
        }
        .action-overlay-copied {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}
