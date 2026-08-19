import { APP_ROUTES } from "./entity-routes";
import { Link } from "react-router-dom";
import type { ChatAction } from "@swaff-y/thunder-chat-core";
import { toListCard, type ListRow } from "@swaff-y/thunder-chat-core";

/**
 * TD-057: the design's list card, drawn beneath the answer it belongs to.
 *
 * `renderImage` is a slot rather than a fetch: halo-mcp's presigned URLs
 * are stripped before the action is persisted, so real thumbnails need a
 * by-id lookup that arrives with TD-058 and fills this in from outside.
 */
export default function ActionCardList({
  action,
  renderImage,
}: {
  action: ChatAction;
  renderImage?: (row: ListRow) => React.ReactNode;
}): React.JSX.Element | null {
  const card = toListCard(action, APP_ROUTES);
  if (!card) return null;

  const shown = card.rows.length;
  const countLine =
    shown < card.total
      ? `Showing ${shown} of ${card.total}`
      : `${card.total} ${card.total === 1 ? "result" : "results"}`;

  return (
    <section className="card-list" aria-label={card.title}>
      <header className="card-list-head">
        <span className="card-list-kind">Action · list</span>
        <h3 className="card-list-title">{card.title}</h3>
        <code className="card-list-tool">{card.tool}</code>
      </header>

      {shown === 0 ? (
        <p className="card-list-empty">{card.emptyMessage}</p>
      ) : (
        <>
          <p className="card-list-column">{card.metricLabel}</p>
          <ul className="card-list-rows">
            {card.rows.map((row) => (
              <li key={row.key} className="card-list-row">
                <span className="card-list-image" aria-hidden="true">
                  {renderImage?.(row)}
                </span>
                <span className="card-list-body">
                  <span className="card-list-name">{row.name}</span>
                  {row.secondary !== undefined && (
                    <span className="card-list-secondary">{row.secondary}</span>
                  )}
                  <code className="card-list-id">{row.id}</code>
                </span>
                <span className="card-list-metric mono">
                  <span className="visually-hidden">{card.metricLabel}: </span>
                  {row.metric === null ? "—" : row.metric.toLocaleString()}
                </span>
                {row.cta !== undefined && (
                  <Link
                    className="card-list-cta"
                    to={row.cta.to}
                    aria-label={`${row.cta.label}: ${row.name}`}
                  >
                    {row.cta.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <footer className="card-list-foot">
            <span>{countLine}</span>
            {card.note !== undefined && <span>{card.note}</span>}
            {card.hasMore && <span>more available</span>}
          </footer>
        </>
      )}

      <style>{`
        .card-list {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }
        .card-list-head {
          align-items: baseline;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-list-kind {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-list-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .card-list-tool {
          color: var(--color-accent-light);
          font-size: var(--text-caption);
        }
        .card-list-column {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          margin: 0;
          padding: var(--space-xs) var(--space-md);
          text-align: right;
          text-transform: uppercase;
        }
        .card-list-rows {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .card-list-row {
          align-items: center;
          border-top: 1px solid var(--color-border);
          display: flex;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-list-image {
          background: var(--color-bg-alt);
          border-radius: var(--radius-sm);
          flex: none;
          height: 40px;
          overflow: hidden;
          width: 40px;
        }
        .card-list-body {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
        }
        .card-list-name {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .card-list-secondary {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .card-list-id {
          color: var(--color-text-faint);
          font-size: var(--text-caption);
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-variant-numeric: tabular-nums;
        }
        .card-list-metric {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          text-align: right;
        }
        .card-list-cta {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
          text-decoration: none;
          white-space: nowrap;
        }
        .card-list-cta:hover {
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .card-list-empty,
        .card-list-foot {
          border-top: 1px solid var(--color-border);
          color: var(--color-text-muted);
          display: flex;
          font-size: var(--text-caption);
          gap: var(--space-md);
          margin: 0;
          padding: var(--space-sm) var(--space-md);
        }
      `}</style>
    </section>
  );
}
