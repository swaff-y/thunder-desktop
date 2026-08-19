import { IoRefresh } from "react-icons/io5";
import { useRandomRecords } from "../hooks/useRecords";
import { useChat } from "@swaff-y/thunder-chat-core";
import { useChatEnabled } from "../hooks/useSettings";
import HeroCarousel from "../components/desktop/HeroCarousel";
import VirtualRecordList from "../components/shared/VirtualRecordList";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";
import ChatPanel from "../components/chat/ChatPanel";

export default function Home() {
  const chatEnabled = useChatEnabled();
  const { isEmpty } = useChat();
  const { data, isLoading, isError, error, isRefetching, refetch } =
    useRandomRecords();

  const records = data?.data ?? [];
  // The query keeps running either way — hiding the section must not evict
  // the cache, or clearing the chat would reshuffle the carousel.
  const showFeatured = !chatEnabled || isEmpty;

  function handleRefresh() {
    void refetch();
  }

  // ChatPanel keeps one position in the tree across both states — moving it
  // would remount the panel, and the composer's draft with it.
  function featured() {
    if (isLoading) return <LoadingSpinner fullScreen />;
    if (isError)
      return (
        <ErrorState
          message={error?.message || "Failed to load content"}
          onRetry={() => refetch()}
        />
      );
    return (
      <>
        <HeroCarousel records={records} />
        <div className="library-header">
          <h2 className="section-title">Your Library</h2>
          <button
            type="button"
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-busy={isRefetching}
            aria-label="Refresh library"
          >
            <IoRefresh
              size={18}
              aria-hidden
              className={isRefetching ? "spinning" : undefined}
            />
          </button>
        </div>
        <VirtualRecordList records={records} />
      </>
    );
  }

  return (
    <div>
      {chatEnabled && <ChatPanel />}
      {showFeatured && featured()}

      <style>{`
        .library-header {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-md);
        }
        .section-title {
          font-size: var(--text-h2);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0;
        }
        .refresh-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-xs);
          background: none;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          color: var(--color-text-muted);
          cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .refresh-btn:hover:not(:disabled) {
          background: rgba(14, 165, 233, 0.08);
          color: var(--color-accent);
          border-color: var(--color-accent);
        }
        .refresh-btn:disabled {
          cursor: not-allowed;
          opacity: 0.6;
        }
        .spinning {
          animation: refresh-spin 0.8s linear infinite;
        }
        @keyframes refresh-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
