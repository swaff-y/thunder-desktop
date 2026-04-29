import { useEffect, useMemo, useState } from "react";
import { Form, Row, Col } from "react-bootstrap";
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
import { useTopEntities, useCtr } from "../../../hooks/useStats";
import type { StatsEntityType } from "../../../types";
import LoadingSpinner from "../../shared/LoadingSpinner";
import ErrorState from "../../shared/ErrorState";
import { isoDaysAgo, formatDate } from "../../../utils/dateFormatters";

const ENTITY_TYPE_OPTIONS: { value: StatsEntityType; label: string }[] = [
  { value: "tag", label: "Tag" },
  { value: "movie", label: "Movie" },
  { value: "series", label: "Series" },
  { value: "actor", label: "Actor" },
];

// CTR is returned by the API as a fraction in [0, 1], rounded to 4 decimal places.
function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export default function CtrSection() {
  const [selectedType, setSelectedType] = useState<StatsEntityType>("tag");
  const [selectedId, setSelectedId] = useState<string>("");

  const { startDate, endDate } = useMemo(
    () => ({ startDate: isoDaysAgo(30), endDate: isoDaysAgo(0) }),
    [],
  );

  const {
    data: topData,
    isLoading: topLoading,
    isError: topError,
  } = useTopEntities(selectedType, 25);

  const {
    data: ctrData,
    isLoading: ctrLoading,
    isError: ctrIsError,
    error: ctrError,
    refetch: refetchCtr,
  } = useCtr(selectedType, selectedId, startDate, endDate, "day");

  // Reset selected entity when type changes
  useEffect(() => {
    setSelectedId("");
  }, [selectedType]);

  const entityOptions = topData?.items ?? [];

  const chartPoints = useMemo(() => {
    if (!ctrData?.data) return [];
    return ctrData.data.map((p) => ({
      date: p.date,
      clicks: p.clicks,
      record_views: p.record_views,
      ctr: p.ctr * 100,
    }));
  }, [ctrData]);

  const renderChartArea = () => {
    if (!selectedId) {
      return (
        <div className="ctr-empty">
          Select an entity to view CTR data
        </div>
      );
    }
    if (ctrLoading) return <LoadingSpinner />;
    if (ctrIsError)
      return (
        <ErrorState
          message={
            ctrError instanceof Error ? ctrError.message : "Failed to load CTR data"
          }
          onRetry={() => refetchCtr()}
        />
      );
    if (chartPoints.length === 0) {
      return <div className="ctr-empty">No CTR data available</div>;
    }

    return (
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartPoints} margin={{ top: 16, right: 24, left: 0, bottom: 8 }}>
          <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            stroke="#94a3b8"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <YAxis
            yAxisId="left"
            stroke="#94a3b8"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            stroke="#94a3b8"
            tick={{ fill: "#94a3b8", fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#f1f5f9",
            }}
            labelFormatter={formatDate}
            formatter={(value, name) => {
              const num = typeof value === "number" ? value : Number(value);
              const label = String(name);
              if (label === "CTR %") return [`${num.toFixed(1)}%`, label];
              return [num.toLocaleString(), label];
            }}
          />
          <Legend wrapperStyle={{ color: "#f1f5f9" }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="clicks"
            name="Clicks"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="record_views"
            name="Record Views"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="ctr"
            name="CTR %"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  const showSummaryCards = !!selectedId && !!ctrData && !ctrIsError;

  return (
    <section className="ctr-section">
      <h2 className="ctr-title">Click-Through Rate</h2>

      <Row className="g-3 ctr-controls">
        <Col xs={12} md={6}>
          <Form.Label className="ctr-label">Entity Type</Form.Label>
          <Form.Select
            className="ctr-select"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as StatsEntityType)}
          >
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Form.Select>
        </Col>
        <Col xs={12} md={6}>
          <Form.Label className="ctr-label">Entity</Form.Label>
          <Form.Select
            className="ctr-select"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={topLoading || topError || entityOptions.length === 0}
          >
            <option value="">
              {topLoading
                ? "Loading…"
                : topError
                ? "Failed to load entities"
                : entityOptions.length === 0
                ? "No entities available"
                : "Select an entity…"}
            </option>
            {entityOptions.map((item) => (
              <option key={item.entity_id} value={item.entity_id}>
                {item.name}
              </option>
            ))}
          </Form.Select>
        </Col>
      </Row>

      {showSummaryCards && ctrData && (
        <Row className="g-3 ctr-cards">
          <Col xs={12} md={4}>
            <div className="ctr-card">
              <div className="ctr-card-label">Total Clicks</div>
              <div className="ctr-card-value">{ctrData.total_clicks.toLocaleString()}</div>
            </div>
          </Col>
          <Col xs={12} md={4}>
            <div className="ctr-card">
              <div className="ctr-card-label">Total Record Views</div>
              <div className="ctr-card-value">
                {ctrData.total_record_views.toLocaleString()}
              </div>
            </div>
          </Col>
          <Col xs={12} md={4}>
            <div className="ctr-card">
              <div className="ctr-card-label">Overall CTR</div>
              <div className="ctr-card-value">{formatPercent(ctrData.ctr)}</div>
            </div>
          </Col>
        </Row>
      )}

      <div className="ctr-chart-wrap">{renderChartArea()}</div>

      <style>{`
        .ctr-section {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          padding: var(--space-lg);
        }
        .ctr-title {
          font-size: var(--text-h3);
          font-weight: var(--weight-semibold);
          color: var(--color-text);
          margin: 0 0 var(--space-md);
        }
        .ctr-controls {
          margin-bottom: var(--space-md);
        }
        .ctr-label {
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
          margin-bottom: var(--space-xs);
        }
        .ctr-select {
          background: var(--color-bg);
          color: var(--color-text);
          border: 1px solid var(--color-border);
        }
        .ctr-select:focus {
          background: var(--color-bg);
          color: var(--color-text);
          border-color: var(--color-accent);
          box-shadow: 0 0 0 0.2rem rgba(14, 165, 233, 0.25);
        }
        .ctr-select:disabled {
          opacity: 0.6;
        }
        .ctr-cards {
          margin-bottom: var(--space-md);
        }
        .ctr-card {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: var(--space-md);
          height: 100%;
        }
        .ctr-card-label {
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
          margin-bottom: var(--space-xs);
        }
        .ctr-card-value {
          color: var(--color-text);
          font-size: var(--text-h2);
          font-weight: var(--weight-semibold);
          font-variant-numeric: tabular-nums;
        }
        .ctr-chart-wrap {
          width: 100%;
          min-height: 360px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ctr-empty {
          text-align: center;
          padding: var(--space-xl);
          color: var(--color-text-muted);
          font-size: var(--text-body-sm);
        }
      `}</style>
    </section>
  );
}
