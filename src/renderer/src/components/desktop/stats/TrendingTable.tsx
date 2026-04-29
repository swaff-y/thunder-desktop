import { useTrending } from "../../../hooks/useStats";
import type { StatsEntityType } from "../../../types";
import LoadingSpinner from "../../shared/LoadingSpinner";
import ErrorState from "../../shared/ErrorState";

interface TrendingTableProps {
  title: string;
  entityType: StatsEntityType;
}

function formatGrowth(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

export default function TrendingTable({ title, entityType }: TrendingTableProps) {
  const { data, isLoading, isError, error, refetch } = useTrending(entityType);

  const renderBody = () => {
    if (isLoading) return <LoadingSpinner />;
    if (isError)
      return (
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : `Failed to load trending ${entityType}`
          }
          onRetry={() => refetch()}
        />
      );

    const items = data?.items ?? [];
    if (items.length === 0) {
      return <div className="trending-empty">No trending data</div>;
    }

    return (
      <table className="trending">
        <thead>
          <tr>
            <th className="name-col">Name</th>
            <th className="num-col">This Week</th>
            <th className="num-col">Last Week</th>
            <th className="num-col">Growth %</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const positive = item.growth_pct >= 0;
            return (
              <tr key={item.entity_id}>
                <td className="name-col" title={item.name}>
                  {item.name}
                </td>
                <td className="num-col">{item.this_week.toLocaleString()}</td>
                <td className="num-col">{item.last_week.toLocaleString()}</td>
                <td
                  className="num-col growth-col"
                  style={{
                    color: positive ? "var(--color-success)" : "var(--color-danger)",
                  }}
                >
                  {formatGrowth(item.growth_pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <section className="trending-table">
      <h2 className="trending-title">{title}</h2>
      <div className="trending-wrap">{renderBody()}</div>

      <style>{`
        .trending-table {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          height: 100%;
        }
        .trending-title {
          font-size: var(--text-h3);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0 0 var(--space-md);
        }
        .trending-wrap {
          width: 100%;
        }
        .trending {
          width: 100%;
          border-collapse: collapse;
          color: var(--color-text);
          table-layout: fixed;
        }
        .trending th {
          text-align: left;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-medium);
          color: var(--color-text-muted);
          padding: var(--space-sm) var(--space-md);
          border-bottom: 1px solid var(--color-border);
        }
        .trending td {
          padding: var(--space-sm) var(--space-md);
          border-bottom: 1px solid var(--color-border);
          font-size: var(--text-body-sm);
        }
        .trending tbody tr:last-child td {
          border-bottom: none;
        }
        .trending .name-col {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .trending .num-col {
          text-align: right;
          font-variant-numeric: tabular-nums;
          width: 5.5rem;
        }
        .trending .growth-col {
          font-weight: var(--weight-semibold);
        }
        .trending-empty {
          text-align: center;
          padding: var(--space-lg);
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
        }
      `}</style>
    </section>
  );
}
