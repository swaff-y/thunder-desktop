import { useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useCategoryRecords } from "../hooks/useRecords";
import { getCategoryConfig } from "../types";
import VirtualRecordList from "../components/shared/VirtualRecordList";
import LoadMore from "../components/shared/LoadMore";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";

export default function CategoryDetail() {
  const { category, id } = useParams<{ category: string; id: string }>();
  const config = getCategoryConfig(category);

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useCategoryRecords(config?.apiPath ?? "", id!, !!config);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0,
      rootMargin: "0px 0px 50% 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  if (!config) return <ErrorState message={`Unknown category: ${category}`} />;
  if (isLoading) return <LoadingSpinner fullScreen />;
  if (isError)
    return (
      <ErrorState
        message={error?.message || "Failed to load records"}
        onRetry={() => refetch()}
      />
    );

  const allRecords = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div style={{ minWidth: 0 }}>
      <h1 className="detail-page-title">{config.label} Detail</h1>
      {data && allRecords.length === 0 && !isFetchingNextPage ? (
        <div
          style={{
            textAlign: "center",
            padding: "var(--space-xl)",
            color: "var(--color-text-muted)",
          }}
        >
          No records
        </div>
      ) : (
        <VirtualRecordList records={allRecords} />
      )}
      <LoadMore
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
      <div ref={sentinelRef} />

      <style>{`
        .detail-page-title {
          font-size: var(--text-h1);
          font-weight: var(--weight-bold);
          color: var(--color-text);
          margin-bottom: var(--space-lg);
        }
      `}</style>
    </div>
  );
}
