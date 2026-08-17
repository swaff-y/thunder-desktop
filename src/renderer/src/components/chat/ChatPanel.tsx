import { useEffect, useRef, useState } from "react";
import { Spinner } from "react-bootstrap";
import type { ChatAction, ChatStatus } from "../../../../shared/chat";
import { useChat, type ChatTurn } from "../../hooks/useChat";
import ActionCardChart from "./ActionCardChart";
import ActionCardList from "./ActionCardList";
import ActionCardRecord from "./ActionCardRecord";
import ActionRowImage from "./ActionRowImage";
import ChatError from "./ChatError";
import type { ListRow } from "./list-adapters";

const RUNNING_QUERY = "Running catalogue query…";

/**
 * The one thing a screen reader is told about a turn: that it is running,
 * what it is running, and then the answer itself.
 */
function liveMessage(status: ChatStatus, lastAnswer: string | undefined): string {
  if (status.state === "calling-tool") return `${RUNNING_QUERY} ${status.tool}`;
  if (status.state === "thinking") return "Thinking…";
  return lastAnswer ?? "";
}

function renderRowImage(row: ListRow): React.ReactNode {
  return <ActionRowImage row={row} />;
}

/**
 * The card for the turn that owns the latest action. A single-record card
 * that followed a list keeps a way back to it — the list is the answer to
 * a different question, so it is shown again rather than re-run.
 */
function TurnAction({
  action,
  previousList,
}: {
  action: ChatAction;
  previousList: ChatAction | undefined;
}): React.JSX.Element | null {
  const [showList, setShowList] = useState(false);

  function handleBackToList(): void {
    setShowList(true);
  }

  if (showList && previousList !== undefined) {
    return <ActionCardList action={previousList} renderImage={renderRowImage} />;
  }
  if (action.kind === "chart") {
    return <ActionCardChart action={action} />;
  }
  if (action.kind === "list") {
    return <ActionCardList action={action} renderImage={renderRowImage} />;
  }
  if (action.kind === "single") {
    return (
      <ActionCardRecord
        action={action}
        onBackToList={previousList === undefined ? undefined : handleBackToList}
      />
    );
  }
  return null;
}

export default function ChatPanel() {
  const { turns, status, isEmpty, ask, retry, cancel, clear } = useChat();
  const [draft, setDraft] = useState("");
  const transcriptRef = useRef<HTMLOListElement>(null);

  const isPending = status.state !== "idle";
  const lastAnswer = turns.at(-1)?.answer;
  // Design 2a: only the latest action gets a card — earlier turns keep
  // their text, so the transcript never stacks stale result sets.
  const actionTurns = turns.filter((turn) => turn.action !== undefined);
  const latestActionId = actionTurns.at(-1)?.id;
  // "Back to list" belongs to the list the card came out of — the action
  // immediately before it. An older list further up the transcript answered
  // a different question and would send the reader somewhere they never was.
  const precedingAction = actionTurns.at(-2)?.action;
  const previousList = precedingAction?.kind === "list" ? precedingAction : undefined;

  // The design's `stick()`: a new turn, and the panel on mount, land at the
  // bottom of the transcript rather than wherever the last scroll left it.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [turns]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const question = draft.trim();
    if (!question || isPending) return;
    setDraft("");
    void ask(question);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    setDraft(event.target.value);
  }

  function handleRetry(turn: ChatTurn): void {
    void retry(turn.id);
  }

  return (
    <section className="chat-panel" aria-label="Catalogue chat">
      {/* Idle Home is an invitation, not a window: the header and transcript
          only earn their space once there is a conversation to show. */}
      {!isEmpty && (
        <>
          <header className="chat-header">
            <button type="button" className="chat-clear" onClick={clear}>
              Clear
            </button>
          </header>

          <ol className="chat-transcript" ref={transcriptRef}>
            {turns.map((turn) => (
              <li key={turn.id} className="chat-turn">
                <p className="chat-who">You</p>
                <p className="chat-said">{turn.question}</p>
                {turn.pending && (
                  <span className="chat-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
                {turn.answer !== undefined && (
                  <>
                    <p className="chat-who">Assistant</p>
                    <p className="chat-said">{turn.answer}</p>
                  </>
                )}
                {turn.action !== undefined && turn.id === latestActionId && (
                  <TurnAction action={turn.action} previousList={previousList} />
                )}
                {turn.error !== undefined && (
                  <ChatError
                    error={turn.error}
                    message={turn.message}
                    onRetry={() => handleRetry(turn)}
                  />
                )}
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="visually-hidden" role="status">
        {liveMessage(status, lastAnswer)}
      </p>

      {status.state === "calling-tool" && (
        <div className="chat-tool">
          <Spinner animation="border" size="sm" aria-hidden="true" />
          <span>{RUNNING_QUERY}</span>
          <code className="chat-tool-name">{status.tool}</code>
        </div>
      )}

      <form
        className={`chat-composer${isEmpty ? " chat-composer--only" : ""}`}
        onSubmit={handleSubmit}
      >
        <label className="chat-label" htmlFor="chat-question">
          Ask the catalogue
        </label>
        <input
          id="chat-question"
          className="chat-input"
          type="text"
          autoComplete="off"
          value={draft}
          onChange={handleChange}
          disabled={isPending}
        />
        {isPending ? (
          <button type="button" className="chat-submit" onClick={cancel}>
            Stop
          </button>
        ) : (
          <button type="submit" className="chat-submit" disabled={!draft.trim()}>
            Ask
          </button>
        )}
      </form>

      <style>{`
        .chat-panel {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-card);
          display: flex;
          flex-direction: column;
          margin-bottom: var(--space-lg);
          overflow: hidden;
        }
        .chat-header {
          align-items: center;
          border-bottom: 1px solid var(--color-border);
          display: flex;
          justify-content: flex-end;
          padding: var(--space-sm) var(--space-md);
        }
        .chat-clear {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text-muted);
          cursor: pointer;
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
        }
        .chat-clear:disabled {
          cursor: default;
          opacity: 0.5;
        }
        .chat-transcript {
          list-style: none;
          margin: 0;
          max-height: 55vh;
          overflow-y: auto;
          padding: 0;
        }
        .chat-turn {
          border-top: 1px solid var(--color-border);
          padding: var(--space-md);
        }
        .chat-turn:first-child {
          border-top: none;
        }
        .chat-who {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          letter-spacing: 0.08em;
          margin: 0 0 var(--space-xs);
          text-transform: uppercase;
        }
        .chat-said {
          color: var(--color-text);
          font-size: var(--text-body);
          margin: 0 0 var(--space-md);
          white-space: pre-wrap;
        }
        .chat-said:last-child {
          margin-bottom: 0;
        }
        .chat-dots {
          display: inline-flex;
          gap: var(--space-xs);
        }
        .chat-dots > span {
          animation: chat-blink 1.2s infinite ease-in-out;
          background: var(--color-accent);
          border-radius: var(--radius-full);
          height: 6px;
          width: 6px;
        }
        .chat-dots > span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .chat-dots > span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes chat-blink {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-dots > span {
            animation: none;
            opacity: 0.6;
          }
        }
        .chat-tool {
          align-items: center;
          border-top: 1px solid var(--color-border);
          color: var(--color-text-muted);
          display: flex;
          font-size: var(--text-body-sm);
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .chat-tool-name {
          color: var(--color-accent-light);
          font-size: var(--text-caption);
        }
        .chat-composer {
          align-items: center;
          border-top: 1px solid var(--color-border);
          display: flex;
          gap: var(--space-sm);
          padding: var(--space-md);
        }
        /* Idle: the composer is the panel, so it needs no divider above it. */
        .chat-composer--only {
          border-top: none;
        }
        .chat-label {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
        }
        .chat-input {
          background: var(--color-bg-alt);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text);
          flex: 1;
          font-size: var(--text-body-sm);
          padding: var(--space-sm) var(--space-md);
        }
        .chat-input:focus {
          border-color: var(--color-accent);
          outline: none;
        }
        .chat-input:disabled {
          opacity: 0.6;
        }
        .chat-submit {
          background: var(--color-accent);
          border: none;
          border-radius: var(--radius-xl);
          color: var(--color-text-on-accent);
          cursor: pointer;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-medium);
          padding: var(--space-sm) var(--space-lg);
        }
        .chat-submit:disabled {
          cursor: default;
          opacity: 0.5;
        }
      `}</style>
    </section>
  );
}
