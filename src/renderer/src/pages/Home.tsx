import { IoRefresh } from "react-icons/io5";
import { useRandomRecords } from "../hooks/useRecords";
import HeroCarousel from "../components/desktop/HeroCarousel";
import VirtualRecordList from "../components/shared/VirtualRecordList";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";

export default function Home() {
  const { data, isLoading, isError, error, isRefetching, refetch } =
    useRandomRecords();

  const records = data?.data ?? [];

  function handleRefresh() {
    void refetch();
  }

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
      {featured()}

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
