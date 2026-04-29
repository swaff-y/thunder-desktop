import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { usePlatformActivity } from "../../../hooks/useStats";
import LoadingSpinner from "../../shared/LoadingSpinner";
import ErrorState from "../../shared/ErrorState";
import { isoDaysAgo, formatDate } from "../../../utils/dateFormatters";

export default function PlatformActivityChart() {
  const { startDate, endDate } = useMemo(
    () => ({ startDate: isoDaysAgo(30), endDate: isoDaysAgo(0) }),
    [],
  );

  const { data, isLoading, isError, error, refetch } = usePlatformActivity(
    startDate,
    endDate,
    "day",
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError)
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load platform activity"}
        onRetry={() => refetch()}
      />
    );

  const points = data?.data ?? [];

  return (
    <section className="platform-activity-chart">
      <h2 className="chart-title">Platform Activity</h2>
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={points} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
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
            <Legend wrapperStyle={{ color: "#f1f5f9" }} />
            <Line
              type="monotone"
              dataKey="total_clicks"
              name="Clicks"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="total_views"
              name="Views"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <style>{`
        .platform-activity-chart {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
        }
        .chart-title {
          font-size: var(--text-h3);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0 0 var(--space-md);
        }
        .chart-wrap {
          width: 100%;
        }
      `}</style>
    </section>
  );
}
