import type { ChatAction } from "@swaff-y/thunder-chat-core";

/**
 * TD-059: the design's chart card — a horizontal bar per row, drawn from
 * the bars the model handed back through `show_chart`.
 *
 * No charting library. `recharts` is already here for Stats, but a bar
 * row is a span with a width, and an SVG chart engine would cost more
 * than it explains.
 *
 * A table rather than a stack of divs: the bars themselves are decoration
 * (`aria-hidden`), so the name/value pairs have to carry the whole card
 * for anyone reading it with a screen reader.
 */
export default function ActionCardChart({
  action,
}: {
  action: ChatAction;
}): React.JSX.Element | null {
  const { title, tool, metricLabel, bars } = action;
  if (bars === undefined || bars.length === 0 || metricLabel === undefined) return null;

  // A small catalogue can rank every entity at zero events — halo-mcp says
  // so — and `value / 0` would paint every bar `NaN%` wide.
  const max = Math.max(...bars.map((bar) => bar.value));
  const widthOf = (value: number): string =>
    max <= 0 ? "0%" : `${Math.max(0, (value / max) * 100)}%`;

  // Same honesty rule as TD-057: the ranking tool answers over all time,
  // not over a window, and the caption has to say so.
  const caption =
    tool === "get_top_entities"
      ? `${metricLabel} · top ${bars.length} · all time`
      : `${metricLabel} · top ${bars.length}`;

  return (
    <section className="card-chart" aria-label={title}>
      <header className="card-chart-head">
        <span className="card-chart-kind">Action · chart</span>
        <h3 className="card-chart-title">{title}</h3>
        <code className="card-chart-tool">{tool}</code>
      </header>

      <table className="card-chart-table">
        <caption className="visually-hidden">{`${title} — ${metricLabel} by name`}</caption>
        <colgroup>
          <col className="card-chart-col-name" />
          <col />
          <col className="card-chart-col-value" />
        </colgroup>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Bar</th>
            <th scope="col">{metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar, index) => (
            <tr key={`${bar.name}-${index}`}>
              <th scope="row" className="card-chart-name">
                {bar.name}
              </th>
              <td className="card-chart-track" aria-hidden="true">
                <span className="card-chart-rail">
                  <span className="card-chart-bar" style={{ width: widthOf(bar.value) }} />
                </span>
              </td>
              <td className="card-chart-value mono">{bar.value.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="card-chart-foot">{caption}</footer>

      <style>{`
        .card-chart {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }
        .card-chart-head {
          align-items: baseline;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-chart-kind {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-chart-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .card-chart-tool {
          color: var(--color-accent-light);
          font-size: var(--text-caption);
        }
        .card-chart-table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
        }
        .card-chart-col-name {
          width: 170px;
        }
        .card-chart-col-value {
          width: 92px;
        }
        .card-chart-name,
        .card-chart-track,
        .card-chart-value {
          padding: var(--space-xs) var(--space-md);
          vertical-align: middle;
        }
        .card-chart-name {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          font-weight: var(--weight-regular);
          overflow: hidden;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .card-chart-rail {
          background: var(--color-bg-alt);
          border-radius: 2px;
          display: block;
          height: 10px;
          overflow: hidden;
        }
        .card-chart-bar {
          background: var(--color-accent);
          border-radius: 2px;
          display: block;
          height: 100%;
        }
        .card-chart-value {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          text-align: right;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-variant-numeric: tabular-nums;
        }
        .card-chart-foot {
          border-top: 1px solid var(--color-border);
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          padding: var(--space-sm) var(--space-md);
        }
      `}</style>
    </section>
  );
}
