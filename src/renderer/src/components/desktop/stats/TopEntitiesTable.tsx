import { useTopEntities } from "../../../hooks/useStats";
import type { StatsEntityType } from "../../../types";
import LoadingSpinner from "../../shared/LoadingSpinner";
import ErrorState from "../../shared/ErrorState";

interface TopEntitiesTableProps {
  title: string;
  entityType: StatsEntityType;
  limit?: number;
}

export default function TopEntitiesTable({
  title,
  entityType,
  limit = 10,
}: TopEntitiesTableProps) {
  const { data, isLoading, isError, error, refetch } = useTopEntities(entityType, limit);

  const renderBody = () => {
    if (isLoading) return <LoadingSpinner />;
    if (isError)
      return (
        <ErrorState
          message={
            error instanceof Error
              ? error.message
              : `Failed to load top ${entityType}`
          }
          onRetry={() => refetch()}
        />
      );

    const items = data?.items ?? [];
    if (items.length === 0) {
      return <div className="top-entities-empty">No data available</div>;
    }

    return (
      <table className="top-entities">
        <thead>
          <tr>
            <th className="rank-col">#</th>
            <th className="name-col">Name</th>
            <th className="count-col">Count</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.entity_id}>
              <td className="rank-col">{i + 1}</td>
              <td className="name-col" title={item.name}>
                {item.name}
              </td>
              <td className="count-col">{item.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <section className="top-entities-table">
      <h2 className="top-entities-title">{title}</h2>
      <div className="top-entities-wrap">{renderBody()}</div>

      <style>{`
        .top-entities-table {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
          height: 100%;
        }
        .top-entities-title {
          font-size: var(--text-h3);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0 0 var(--space-md);
        }
        .top-entities-wrap {
          width: 100%;
        }
        .top-entities {
          width: 100%;
          border-collapse: collapse;
          color: var(--color-text);
          table-layout: fixed;
        }
        .top-entities th {
          text-align: left;
          font-size: var(--text-body-sm);
          font-weight: var(--weight-medium);
          color: var(--color-text-muted);
          padding: var(--space-sm) var(--space-md);
          border-bottom: 1px solid var(--color-border);
        }
        .top-entities td {
          padding: var(--space-sm) var(--space-md);
          border-bottom: 1px solid var(--color-border);
          font-size: var(--text-body-sm);
        }
        .top-entities tbody tr:last-child td {
          border-bottom: none;
        }
        .top-entities .rank-col {
          width: 2.5rem;
          color: var(--color-text-muted);
          text-align: right;
        }
        .top-entities .count-col {
          width: 5rem;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .top-entities .name-col {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .top-entities-empty {
          text-align: center;
          padding: var(--space-lg);
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
        }
      `}</style>
    </section>
  );
}
