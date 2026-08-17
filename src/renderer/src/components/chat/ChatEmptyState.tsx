interface ChatEmptyStateProps {
  onSuggestion: (question: string) => void;
}

// Doubling as the discoverability story: these are the two shapes of
// question the catalogue tools can actually answer today.
const SUGGESTIONS = [
  "Show me the most popular actors",
  "List the actors starting with 'mar'",
] as const;

export default function ChatEmptyState({ onSuggestion }: ChatEmptyStateProps) {
  return (
    <div className="chat-empty">
      <p className="chat-empty-prompt">Ask the catalogue a question.</p>
      <ul className="chat-suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="chat-chip"
              onClick={() => onSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      <style>{`
        .chat-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-xl) var(--space-md);
          text-align: center;
        }
        .chat-empty-prompt {
          color: var(--color-text-muted);
          font-size: var(--text-body);
          margin: 0;
        }
        .chat-suggestions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--space-sm);
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .chat-chip {
          background: var(--color-surface-light);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-text);
          cursor: pointer;
          font-size: var(--text-body-sm);
          padding: var(--space-sm) var(--space-md);
          transition: border-color 0.2s, color 0.2s;
        }
        .chat-chip:hover {
          border-color: var(--color-accent);
          color: var(--color-accent-light);
        }
      `}</style>
    </div>
  );
}
