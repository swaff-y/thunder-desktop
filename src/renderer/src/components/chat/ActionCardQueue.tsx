import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  imageTargetFor,
  toQueueCard,
  type ChatAction,
  type QueueCard,
  type QueueItem,
} from "@swaff-y/thunder-chat-core";
import { fetchRecord } from "../../api/halo";
import { useCart } from "../../hooks/useCart";
import { useRecord } from "../../hooks/useRecord";
import type { ContentRecord } from "../../types";
import { useActionImages } from "./useActionImages";

/**
 * TC-046's queue card: four records the model picked out of a catalogue
 * read, proposed for the watch queue.
 *
 * "Watch queue" is the canonical term for what this repo still calls the
 * cart; the copy says what the chat and the other two clients say.
 *
 * The card proposes and the button acts — nothing changes until someone
 * presses, so a restored transcript has a live button and no persisted
 * pressed-state, exactly like `ActionCardUpload`.
 */
export default function ActionCardQueue({
  action,
}: {
  action: ChatAction;
}): React.JSX.Element | null {
  const card = toQueueCard(action);
  if (card === undefined) return null;
  return <QueueCardBody card={card} />;
}

/**
 * The action carries no URL — presigned ones are stripped at every depth
 * before the transcript is persisted (TD-054) — so the picture and the
 * name both come from a by-id re-read, the rule TD-058 settled. Both hooks
 * read the same `["record", id]` query, so this is one request per row.
 */
function QueueRow({ item }: { item: QueueItem }): React.JSX.Element {
  const { slides } = useActionImages(imageTargetFor("record", item.id));
  const record = useRecord(item.id);
  const url = slides.find((slide) => slide.url !== undefined)?.url;

  return (
    <li className="card-queue-row">
      <span className="card-queue-image" aria-hidden="true">
        {url !== undefined && <img className="card-queue-thumb" src={url} alt="" />}
      </span>
      <span className="card-queue-body">
        <span className="card-queue-name">{item.name ?? record.data?.name ?? item.id}</span>
        <code className="card-queue-id mono">{item.id}</code>
      </span>
    </li>
  );
}

function QueueCardBody({ card }: { card: QueueCard }): React.JSX.Element {
  const queryClient = useQueryClient();
  const { add, clear } = useCart();
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<number | undefined>(undefined);

  /**
   * A failed read does not drop the record: playback is by id, so the
   * minimal shape queues fine and costs one blank thumbnail. Fabricating
   * associations would be worse — an empty `CartDropdown` row and an empty
   * `MultiWatch` cell both read as real ones.
   */
  async function resolve(item: QueueItem): Promise<ContentRecord> {
    try {
      return await queryClient.fetchQuery({
        queryKey: ["record", item.id],
        queryFn: () => fetchRecord(item.id),
      });
    } catch {
      return { id: item.id, name: item.name ?? item.id, actors: [], tags: [], images: [] };
    }
  }

  /**
   * `add` silently drops past `MAX_CART_SIZE`, so appending into a queue
   * holding two would give two of the four asked for and say nothing.
   * The button replaces.
   */
  async function handleQueue(): Promise<void> {
    setBusy(true);
    const records = await Promise.all(card.items.map(resolve));
    clear();
    for (const record of records) add(record);
    setQueued(records.length);
    setBusy(false);
  }

  function handleClick(): void {
    void handleQueue();
  }

  return (
    <section className="card-queue" aria-label={card.title}>
      <header className="card-queue-head">
        <span className="card-queue-kind">Action · queue</span>
        <h3 className="card-queue-title">{card.title}</h3>
      </header>

      <div className="card-queue-content">
        <p className="card-queue-caption">
          Queueing these <strong>replaces</strong> whatever is in your watch queue.
        </p>

        <ul className="card-queue-rows">
          {card.items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>

        <button type="button" className="card-queue-btn" onClick={handleClick} disabled={busy}>
          {busy ? "Queueing…" : "Replace watch queue"}
        </button>

        {queued !== undefined && (
          <p className="card-queue-ack" role="status">
            Queued {queued} {queued === 1 ? "record" : "records"}.
            {queued < 2 && " MultiWatch needs two."}
          </p>
        )}
      </div>

      <style>{`
        .card-queue {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: var(--space-md);
          overflow: hidden;
        }
        .card-queue-head {
          align-items: baseline;
          background: var(--color-bg-alt);
          border-bottom: 1px solid var(--color-border);
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .card-queue-kind {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .card-queue-title {
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-semibold);
          margin: 0;
        }
        .card-queue-content {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          padding: var(--space-md);
        }
        .card-queue-caption {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          margin: 0;
        }
        .card-queue-caption strong {
          color: var(--color-text);
          font-weight: var(--weight-semibold);
        }
        .card-queue-rows {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .card-queue-row {
          align-items: center;
          display: flex;
          gap: var(--space-sm);
        }
        .card-queue-image {
          background: var(--color-bg-alt);
          border-radius: var(--radius-sm);
          flex: none;
          height: 48px;
          overflow: hidden;
          width: 48px;
        }
        .card-queue-thumb {
          height: 100%;
          object-fit: cover;
          width: 100%;
        }
        .card-queue-body {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .card-queue-name {
          color: var(--color-text);
          font-size: var(--text-body-sm);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .card-queue-id {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
        }
        .card-queue-btn {
          align-self: flex-start;
          background: var(--color-bg-alt);
          border: 1px solid var(--color-accent);
          border-radius: var(--radius-sm);
          color: var(--color-accent-light);
          cursor: pointer;
          font-size: var(--text-body-sm);
          padding: var(--space-xs) var(--space-sm);
        }
        .card-queue-btn:disabled {
          color: var(--color-text-muted);
          cursor: default;
        }
        .card-queue-ack {
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
          margin: 0;
        }
      `}</style>
    </section>
  );
}
