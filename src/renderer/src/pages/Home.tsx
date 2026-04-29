import { useRandomRecords } from "../hooks/useRecords";
import { useIsDesktop } from "../hooks/useMediaQuery";
import HeroCarousel from "../components/desktop/HeroCarousel";
import VirtualRecordList from "../components/shared/VirtualRecordList";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import ErrorState from "../components/shared/ErrorState";

export default function Home() {
  const isDesktop = useIsDesktop();
  const { data, isLoading, isError, error, refetch } = useRandomRecords();

  const records = data?.data ?? [];

  if (isLoading) return <LoadingSpinner fullScreen />;
  if (isError)
    return (
      <ErrorState
        message={error?.message || "Failed to load content"}
        onRetry={() => refetch()}
      />
    );

  return (
    <div>
      {isDesktop && (
        <>
          <HeroCarousel records={records} />
          <h2 className="section-title">Your Library</h2>
        </>
      )}
      <VirtualRecordList records={records} />

      <style>{`
        .section-title {
          font-size: var(--text-h2);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin-bottom: var(--space-md);
        }
      `}</style>
    </div>
  );
}
