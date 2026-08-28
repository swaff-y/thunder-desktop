import { APP_ROUTES } from "./entity-routes";
import { Link } from "react-router-dom";
import type { ChatAction } from "@swaff-y/thunder-chat-core";
import ImageCarousel, { type CarouselImage } from "../shared/ImageCarousel";
import { toSingleCard } from "@swaff-y/thunder-chat-core";
import { ChipSection, useCopyId } from "./record-parts";
import { useActionImages } from "./useActionImages";

/**
 * TD-058: the design's single-record card.
 *
 * Every picture here is fetched by id — nothing is drawn from the action
 * payload, whose presigned URLs are stripped upstream and would be stale
 * anyway once a conversation is restored from `sessionStorage`.
 */

const CAROUSEL_HEIGHT = 250;

function slidesFor(
  slides: CarouselImage[],
  isLoading: boolean,
  isError: boolean
): CarouselImage[] {
  if (isError) return [{ label: "Image unavailable" }];
  if (isLoading) return [{ label: "Loading image…" }];
  return slides;
}

export default function ActionCardRecord({
  action,
  onBackToList,
  onExpand,
}: {
  action: ChatAction;
  onBackToList?: () => void;
  /** TD-069: absent outside the drawer, where there is nowhere to expand into. */
  onExpand?: () => void;
}): React.JSX.Element | null {
  const card = toSingleCard(action, APP_ROUTES);
  const images = useActionImages(card?.image);
  const { copied, copy } = useCopyId(card?.id ?? "");

  if (!card) return null;

  return (
    <section className="card-single" aria-label={card.name}>
      <header className="card-single-head">
        <span className="card-single-kind">Action · {card.entityLabel}</span>
        <code className="card-single-tool">{card.tool}</code>
        {onBackToList !== undefined && (
          <button type="button" className="card-single-back" onClick={onBackToList}>
            Back to list
          </button>
        )}
        {onExpand !== undefined && (
          <button type="button" className="card-single-back" onClick={onExpand}>
            Expand
          </button>
        )}
      </header>

      <div className="card-single-body">
        {card.image !== undefined && (
          <ImageCarousel
            images={slidesFor(images.slides, images.isLoading, images.isError)}
            height={CAROUSEL_HEIGHT}
            autoAdvance={false}
            showControls
          />
        )}

        <div className="card-single-meta">
          <div className="card-single-titles">
            <h3 className="card-single-name">{card.name}</h3>
            <code className="card-single-id">{card.id}</code>
          </div>
          {card.metrics.length > 0 && (
            <dl className="card-single-metrics">
              {card.metrics.map((metric) => (
                <div key={metric.label} className="card-single-metric">
                  <dt className="card-single-metric-label">{metric.label}</dt>
                  <dd className="card-single-metric-value mono">
                    {metric.value === null ? "—" : metric.value.toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {card.associations.length > 0 && (
          <dl className="card-single-associations">
            {card.associations.map((association) => (
              <div key={association.label} className="card-single-association">
                <dt>{association.label}</dt>
                <dd>
                  {association.to === undefined ? (
                    association.name
                  ) : (
                    <Link to={association.to}>{association.name}</Link>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <ChipSection heading="Actors" chips={card.cast} />
        <ChipSection heading="Tags" chips={card.tags} />
      </div>

      <footer className="card-single-foot">
        <button type="button" className="card-single-button" onClick={copy}>
          Copy ID
        </button>
        {card.route !== undefined && (
          <Link className="card-single-button" to={card.route}>
            Open in catalogue
          </Link>
        )}
        <span className="card-single-copied" role="status">
          {copied ? "ID copied" : ""}
        </span>
      </footer>

      <style>{`
        .card-single {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }
        .card-single-head {
          align-items: center;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-single-kind {
          color: var(--color-text-muted);
          flex: 1;
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-single-tool {
          color: var(--color-accent-light);
          font-size: var(--text-caption);
        }
        .card-single-back {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
        }
        .card-single-body {
          padding: var(--space-md);
        }
        .card-single-meta {
          align-items: flex-start;
          display: flex;
          gap: var(--space-md);
          padding-top: var(--space-md);
        }
        .card-single-titles {
          flex: 1;
          min-width: 0;
        }
        .card-single-name {
          color: var(--color-text);
          font-size: 21px;
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .card-single-id {
          color: var(--color-text-faint);
          font-size: var(--text-caption);
        }
        .card-single-metrics {
          display: flex;
          gap: var(--space-lg);
          margin: 0;
        }
        .card-single-metric {
          text-align: right;
        }
        .card-single-metric-label {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-single-metric-value {
          color: var(--color-text);
          margin: 0;
        }
        .card-single-associations {
          border-top: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-lg);
          margin: var(--space-md) 0 0;
          padding-top: var(--space-md);
        }
        .card-single-association dt {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          font-weight: var(--weight-medium);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-single-association dd {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          margin: 0;
        }
        .card-single-association a {
          color: var(--color-accent-light);
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-variant-numeric: tabular-nums;
        }
        .card-single-foot {
          align-items: center;
          border-top: 1px solid var(--color-border);
          display: flex;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-single-button {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
          text-decoration: none;
        }
        .card-single-button:hover {
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .card-single-copied {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
        }
      `}</style>
    </section>
  );
}
