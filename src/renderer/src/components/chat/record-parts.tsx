/**
 * TD-069: the chips the single-record card draws, and the expanded view
 * draws too.
 *
 * The overlay is not a second design for a record — it is the same record
 * with room. Extracted rather than copied so the two cannot drift into two
 * answers to one question.
 */

import { Link } from "react-router-dom";
import type { Chip } from "@swaff-y/thunder-chat-core";

function ChipTile({ chip }: { chip: Chip }) {
  return (
    <span className="card-single-chip-tile" aria-hidden="true">
      {chip.initial}
    </span>
  );
}

export function ChipSection({ heading, chips }: { heading: string; chips: Chip[] }) {
  if (chips.length === 0) return null;

  return (
    <div className="card-single-group">
      <h4 className="card-single-group-head">
        {heading} ({chips.length})
      </h4>
      <ul className="card-single-chips">
        {chips.map((chip) => (
          <li key={chip.key}>
            {chip.to === undefined ? (
              <span className="card-single-chip">
                <ChipTile chip={chip} />
                {chip.name}
              </span>
            ) : (
              <Link className="card-single-chip card-single-chip--link" to={chip.to}>
                <ChipTile chip={chip} />
                {chip.name}
              </Link>
            )}
          </li>
        ))}
      </ul>

      <style>{`
        .card-single-group {
          border-top: 1px solid var(--color-border);
          margin-top: var(--space-md);
          padding-top: var(--space-md);
        }
        .card-single-group-head {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          margin: 0 0 var(--space-sm);
          text-transform: uppercase;
        }
        .card-single-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .card-single-chip {
          align-items: center;
          background: var(--color-bg-alt);
          border: 1px solid transparent;
          border-radius: var(--radius-xl);
          color: var(--color-text);
          display: flex;
          font-size: var(--text-caption);
          gap: var(--space-xs);
          padding: var(--space-xs) var(--space-sm);
          text-decoration: none;
        }
        .card-single-chip--link:hover,
        .card-single-chip--link:focus-visible {
          border-color: var(--color-accent);
          color: var(--color-text);
        }
        .card-single-chip-tile {
          align-items: center;
          background: var(--color-accent);
          border-radius: var(--radius-full);
          color: var(--color-text-on-accent);
          display: flex;
          height: 20px;
          justify-content: center;
          width: 20px;
        }
      `}</style>
    </div>
  );
}
