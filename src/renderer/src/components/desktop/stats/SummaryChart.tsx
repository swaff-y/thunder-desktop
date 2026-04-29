import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useSummaryTimeline } from "../../../hooks/useStats";
import type { StatsEntityType, StatsEventType } from "../../../types";
import LoadingSpinner from "../../shared/LoadingSpinner";
import ErrorState from "../../shared/ErrorState";
import { isoDaysAgo, formatDate } from "../../../utils/dateFormatters";

interface SummaryChartProps {
  title: string;
  entityType: StatsEntityType;
  eventType: StatsEventType;
}

export default function SummaryChart({ title, entityType, eventType }: SummaryChartProps) {
  const { startDate, endDate } = useMemo(
    () => ({ startDate: isoDaysAgo(30), endDate: isoDaysAgo(0) }),
    [],
  );

  const { data, isLoading, isError, error, refetch } = useSummaryTimeline(
    entityType,
    eventType,
    startDate,
    endDate,
    "day",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load summary"}
        onRetry={() => refetch()}
      />
    );

  const points = (data?.data ?? []).map((p) => ({
    ...p,
    x: p.date ?? p.period ?? "",
  }));

  return (
    <section className="summary-chart">
      <h2 className="summary-title">{title}</h2>
      <div className="summary-wrap">
        {points.length === 0 ? (
          <div className="summary-empty">No data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={points} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis
                dataKey="x"
                tickFormatter={formatDate}
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fill: "#94a3b8", fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  color: "#f1f5f9",
                }}
                labelFormatter={formatDate}
              />
              <Line
                type="monotone"
                dataKey="count"
                name={title}
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <style>{`
        .summary-chart {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
        }
        .summary-title {
          font-size: var(--text-h3);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0 0 var(--space-md);
        }
        .summary-wrap {
          width: 100%;
        }
        .summary-empty {
          text-align: center;
          padding: var(--space-xl);
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
        }
      `}</style>
    </section>
  );
}
