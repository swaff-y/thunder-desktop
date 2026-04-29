import { Button, Spinner } from "react-bootstrap";

interface LoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

export default function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: LoadMoreProps) {
  if (isFetchingNextPage) {
    return (
      <div className="text-center py-3">
        <Spinner animation="border" size="sm" />
      </div>
    );
  }

  if (!hasNextPage) {
    return (
      <p className="load-more-end">End of results</p>
    );
  }

  return (
    <div className="text-center py-3">
      <Button variant="primary" onClick={fetchNextPage}>
        Load More
      </Button>

      <style>{`
        .load-more-end {
          text-align: center;
          color: var(--color-text-muted);
          font-size: var(--text-caption);
          padding: var(--space-md) 0;
        }
      `}</style>
    </div>
  );
}
