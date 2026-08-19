import { reauthenticate } from "../../api/auth";
import { OPEN_SETTINGS_EVENT } from "../desktop/SettingsModal";
import type { ChatError as ChatErrorKind } from "@swaff-y/thunder-chat-core";

interface ChatErrorProps {
  error: ChatErrorKind;
  /** What the agent loop said, for the kinds that carry no fixed copy. */
  message?: string;
  /** Re-asks the failed question. The transcript keeps it, so nothing is retyped. */
  onRetry: () => void;
}

type Recovery = "retry" | "settings" | "none";

// These three cover too many causes for one sentence to be honest about,
// so the failure's own message is preferred when there is one.
const PREFERS_OWN_MESSAGE: ReadonlySet<ChatErrorKind> = new Set([
  "refusal",
  "loop_limit",
  "unknown",
]);

const COPY: Record<ChatErrorKind, { message: string; recovery: Recovery }> = {
  unauthorized: { message: "Your session expired.", recovery: "retry" },
  // The fix is granting model access in the AWS console for this region,
  // so a retry would only fail the same way.
  bedrock_access_denied: {
    message: "Claude isn't enabled for this AWS region.",
    recovery: "settings",
  },
  unreachable: { message: "Couldn't reach the catalogue service.", recovery: "retry" },
  rate_limited: { message: "Too many questions at once.", recovery: "retry" },
  refusal: { message: "Claude wouldn't answer that one.", recovery: "retry" },
  loop_limit: { message: "That question took too many steps to answer.", recovery: "retry" },
  unknown: { message: "Something went wrong.", recovery: "retry" },
  interrupted: { message: "That question was interrupted.", recovery: "retry" },
  cancelled: { message: "Stopped.", recovery: "none" },
};

export default function ChatError({ error, message, onRetry }: ChatErrorProps) {
  const { message: fallback, recovery } = COPY[error];
  const text = PREFERS_OWN_MESSAGE.has(error) ? (message ?? fallback) : fallback;

  // A retry after `unauthorized` has to mint a fresh token first, or it
  // fails identically. If the refresh itself fails the re-ask surfaces the
  // same error, which is the honest outcome.
  async function handleRetry(): Promise<void> {
    if (error === "unauthorized") {
      await reauthenticate().catch(() => undefined);
    }
    onRetry();
  }

  function handleOpenSettings(): void {
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT));
  }

  return (
    <div className={`chat-error${recovery === "none" ? " chat-error--quiet" : ""}`}>
      <p className="chat-error-message">{text}</p>
      {recovery === "retry" && (
        <button type="button" className="chat-error-action" onClick={handleRetry}>
          Retry
        </button>
      )}
      {recovery === "settings" && (
        <button type="button" className="chat-error-action" onClick={handleOpenSettings}>
          Open Settings
        </button>
      )}

      <style>{`
        .chat-error {
          align-items: center;
          color: var(--color-error-text);
          display: flex;
          font-size: var(--text-body-sm);
          gap: var(--space-sm);
          margin: var(--space-sm) 0 0;
        }
        .chat-error--quiet {
          color: var(--color-text-muted);
        }
        .chat-error-message {
          margin: 0;
        }
        .chat-error-action {
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          color: var(--color-accent-light);
          cursor: pointer;
          font-size: var(--text-caption);
          padding: var(--space-xs) var(--space-md);
        }
        .chat-error-action:hover {
          border-color: var(--color-accent);
        }
      `}</style>
    </div>
  );
}
