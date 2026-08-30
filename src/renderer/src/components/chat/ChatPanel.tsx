import { useEffect, useRef, useState } from "react";
import { Spinner } from "react-bootstrap";
import type { ChatAction, ChatStatus } from "@swaff-y/thunder-chat-core";
import { formatUsageSummary, useChat, type ChatTurn } from "@swaff-y/thunder-chat-core";
import ActionCardChart from "./ActionCardChart";
import ActionOverlay from "./ActionOverlay";
import ActionCardList from "./ActionCardList";
import ActionCardRecord from "./ActionCardRecord";
import ActionRowImage from "./ActionRowImage";
import ChatError from "./ChatError";
import ChatMarkdown from "./ChatMarkdown";
import type { ListRow } from "@swaff-y/thunder-chat-core";

const RUNNING_QUERY = "Running catalogue query…";

/** The drawer focuses the composer on open. */
export const COMPOSER_INPUT_ID = "chat-question";

/** The half-typed question outlives the drawer, which unmounts on close. */
const DRAFT_STORAGE_KEY = "thunder_chat_draft";

function loadDraft(): string {
  return sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? "";
}

/**
 * `Up` recalls a question only from the top line and `Down` only from the
 * bottom one; anywhere else in a multi-line draft the arrows are the caret's.
 */
function caretOnFirstLine(field: HTMLTextAreaElement): boolean {
  return !field.value.slice(0, field.selectionStart).includes("\n");
}

function caretOnLastLine(field: HTMLTextAreaElement): boolean {
  return !field.value.slice(field.selectionEnd).includes("\n");
}

/** A walk back through the questions: `steps` from the newest, and the
 *  draft that was on screen before the walk began. */
type HistoryWalk = { steps: number; typed: string };

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
  onExpand,
}: {
  action: ChatAction;
  previousList: ChatAction | undefined;
  /** TD-069: absent outside the drawer, where there is nowhere to expand into. */
  onExpand?: (action: ChatAction) => void;
}): React.JSX.Element | null {
  const [showList, setShowList] = useState(false);

  function handleBackToList(): void {
    setShowList(true);
  }

  // Whatever the card is showing is what expands — a card the reader sent
  // back to its list expands into that list, not the record behind it.
  function expandHandler(shown: ChatAction): (() => void) | undefined {
    return onExpand === undefined ? undefined : () => onExpand(shown);
  }

  if (showList && previousList !== undefined) {
    return (
      <ActionCardList
        action={previousList}
        renderImage={renderRowImage}
        onExpand={expandHandler(previousList)}
      />
    );
  }
  if (action.kind === "chart") {
    return <ActionCardChart action={action} />;
  }
  if (action.kind === "list") {
    return (
      <ActionCardList
        action={action}
        renderImage={renderRowImage}
        onExpand={expandHandler(action)}
      />
    );
  }
  if (action.kind === "single") {
    return (
      <ActionCardRecord
        action={action}
        onBackToList={previousList === undefined ? undefined : handleBackToList}
        onExpand={expandHandler(action)}
      />
    );
  }
  return null;
}

/**
 * TD-069: the drawer passes this so the cards grow an `Expand` button and
 * the overlay has somewhere to draw. Off by default — `ChatPanel` renders
 * outside the drawer too, and an overlay there would cover the page.
 */
export default function ChatPanel({ expandable = false }: { expandable?: boolean } = {}) {
  const { turns, status, usage, model, ask, retry, cancel, clear } = useChat();
  const [draft, setDraft] = useState(loadDraft);
  const [recall, setRecall] = useState<HistoryWalk | null>(null);
  const [expanded, setExpanded] = useState<ChatAction | null>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const caretToEndRef = useRef(true);

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
  // TD-072: every word of it — the `~`, the "USD", the decimals and the
  // decision to say nothing at all — is the package's. A null is "we do not
  // know", and a $0.00 in its place would read as free.
  const usageSummary = formatUsageSummary(usage, model);

  // The design's `stick()`: a new turn, and the panel on mount, land at the
  // bottom of the transcript rather than wherever the last scroll left it.
  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [turns]);

  // A restored draft, and a recalled question, are text the user did not just
  // type — the caret has to be put at the end of it for them.
  useEffect(() => {
    if (!caretToEndRef.current) return;
    caretToEndRef.current = false;
    const composer = composerRef.current;
    composer?.setSelectionRange(composer.value.length, composer.value.length);
  }, [draft]);

  function writeDraft(text: string): void {
    setDraft(text);
    sessionStorage.setItem(DRAFT_STORAGE_KEY, text);
  }

  function submitQuestion(): void {
    const question = draft.trim();
    if (!question || isPending) return;
    writeDraft("");
    setRecall(null);
    void ask(question);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitQuestion();
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
    // Typing over a recalled question makes it the user's own draft again,
    // so the next `Up` starts from the newest question rather than resuming.
    setRecall(null);
    writeDraft(event.target.value);
  }

  // Recalled text is text the user did not type, so the caret is put at the
  // end of it for them; a null walk is the end of the road back.
  function showRecalled(text: string, walk: HistoryWalk | null): void {
    setRecall(walk);
    caretToEndRef.current = true;
    writeDraft(text);
  }

  function recallQuestion(steps: number, typed: string): void {
    const question = turns.at(-1 - steps)?.question;
    if (question === undefined) return;
    showRecalled(question, { steps, typed });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // The chat convention, not the textarea's: a bare Enter sends rather than
    // inserting the newline it would natively, which is Shift+Enter's job.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitQuestion();
      return;
    }
    if (turns.length === 0) return;
    if (event.key === "ArrowUp" && caretOnFirstLine(event.currentTarget)) {
      event.preventDefault();
      recallQuestion(recall === null ? 0 : recall.steps + 1, recall?.typed ?? draft);
      return;
    }
    if (event.key === "ArrowDown" && recall !== null && caretOnLastLine(event.currentTarget)) {
      event.preventDefault();
      if (recall.steps === 0) showRecalled(recall.typed, null);
      else recallQuestion(recall.steps - 1, recall.typed);
    }
  }

  function handleClear(): void {
    setExpanded(null);
    setRecall(null);
    writeDraft("");
    clear();
  }

  function handleRetry(turn: ChatTurn): void {
    void retry(turn.id);
  }

  // Everything the overlay covers is out of reach while it is open —
  // otherwise Tab walks into a transcript nobody can see, and a reader is
  // told about turns that are not on screen.
  const covered = expanded !== null;

  return (
    <div className="chat-panel">
      <header className="chat-header" inert={covered}>
        <button type="button" className="chat-clear" onClick={handleClear}>
          Clear
        </button>
      </header>

      <ol className="chat-transcript" ref={transcriptRef} inert={covered}>
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
                {/* TD-067: the answer is markdown; the question is not —
                    the user typed that and it is not the model's to
                    format. */}
                <ChatMarkdown text={turn.answer} />
              </>
            )}
            {turn.action !== undefined && turn.id === latestActionId && (
              <TurnAction
                action={turn.action}
                previousList={previousList}
                onExpand={expandable ? setExpanded : undefined}
              />
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

      {/* Not an aria-live region: this changes after every answer, and a
          reader announcing a new dollar figure on top of the answer is
          noise. It is ordinary content, reached at rest. */}
      <p className="chat-usage">{usageSummary}</p>

      <form className="chat-composer" onSubmit={handleSubmit} inert={covered}>
        <label className="chat-label" htmlFor={COMPOSER_INPUT_ID}>
          Ask the catalogue
        </label>
        <textarea
          id={COMPOSER_INPUT_ID}
          ref={composerRef}
          className="chat-input"
          rows={1}
          autoComplete="off"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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

      {/* Covers the transcript and the composer and nothing else — the
          drawer's own header stays reachable, so `Widen` still works and
          widens the overlay with it. */}
      {expanded !== null && (
        <ActionOverlay
          action={expanded}
          previousList={previousList}
          onClose={() => setExpanded(null)}
        />
      )}

      <style>{`
        .chat-panel {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
          position: relative;
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
          flex: 1;
          list-style: none;
          margin: 0;
          min-height: 0;
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
        /* TD-067: markdown supplies its own block elements, so the pre-wrap
           that kept plain-text newlines would double every gap. */
        .chat-md {
          white-space: normal;
        }
        .chat-md > :first-child {
          margin-top: 0;
        }
        .chat-md > :last-child {
          margin-bottom: 0;
        }
        .chat-md p {
          margin: 0 0 var(--space-sm);
        }
        .chat-md-heading {
          display: block;
          margin: 0 0 var(--space-xs);
        }
        .chat-md ul,
        .chat-md ol {
          margin: 0 0 var(--space-sm);
          padding-left: var(--space-lg, 1.5rem);
        }
        .chat-md li {
          margin-bottom: var(--space-xs);
        }
        .chat-md a {
          color: var(--color-accent);
        }
        .chat-md code {
          background: rgba(148, 163, 184, 0.16);
          border-radius: var(--radius-sm);
          font-size: 0.9em;
          padding: 0.1em 0.35em;
        }
        .chat-md pre {
          background: rgba(148, 163, 184, 0.12);
          border-radius: var(--radius-sm);
          margin: 0 0 var(--space-sm);
          overflow-x: auto;
          padding: var(--space-sm);
        }
        .chat-md pre code {
          background: none;
          padding: 0;
        }
        /* A wide table scrolls inside its own box rather than stretching the
           transcript and everything beside it. */
        .chat-md-table-wrap {
          margin: 0 0 var(--space-sm);
          overflow-x: auto;
        }
        .chat-md table {
          border-collapse: collapse;
          font-size: var(--text-body-sm);
        }
        .chat-md th,
        .chat-md td {
          border: 1px solid var(--color-border);
          padding: var(--space-xs) var(--space-sm);
          text-align: left;
        }
        .chat-md th {
          color: var(--color-text-muted);
          font-weight: 600;
        }
        .chat-md blockquote {
          border-left: 2px solid var(--color-border);
          color: var(--color-text-muted);
          margin: 0 0 var(--space-sm);
          padding-left: var(--space-sm);
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
        /* The line first appears the instant the first answer lands, which
           is the worst possible moment to move the input the user is about
           to type in — so the row is always there, empty until it isn't. */
        .chat-usage {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          margin: 0;
          min-height: 1.25em;
          padding: var(--space-xs) var(--space-md) 0;
          text-align: right;
        }
        .chat-composer {
          align-items: flex-end;
          border-top: 1px solid var(--color-border);
          display: flex;
          flex: none;
          gap: var(--space-sm);
          padding: var(--space-md);
        }
        .chat-label {
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          padding-bottom: var(--space-sm);
        }
        /* Grows with the draft and stops at six lines, so a long question
           scrolls inside the composer instead of pushing the drawer past the
           window. field-sizing does the growing; the single row it starts
           from is the resting height either way. */
        .chat-input {
          background: var(--color-bg-alt);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text);
          field-sizing: content;
          flex: 1;
          font-family: inherit;
          font-size: var(--text-body-sm);
          line-height: 1.4;
          max-height: calc(6 * 1.4em + 2 * var(--space-sm));
          overflow-y: auto;
          padding: var(--space-sm) var(--space-md);
          resize: none;
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
    </div>
  );
}
