import { Row, Col } from "react-bootstrap";
import PlatformActivityChart from "../components/desktop/stats/PlatformActivityChart";
import TopEntitiesTable from "../components/desktop/stats/TopEntitiesTable";
import TrendingTable from "../components/desktop/stats/TrendingTable";
import SummaryChart from "../components/desktop/stats/SummaryChart";
import CtrSection from "../components/desktop/stats/CtrSection";

export default function Stats() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
      <h1 className="page-title">Stats</h1>
      <PlatformActivityChart />
      <Row className="g-3">
        <Col xs={12} md={6}>
          <TopEntitiesTable title="Top 10 Tags" entityType="tag" />
        </Col>
        <Col xs={12} md={6}>
          <TopEntitiesTable title="Top 10 Records" entityType="record" />
        </Col>
      </Row>
      <Row className="g-3">
        <Col xs={12} md={6}>
          <TrendingTable title="Trending Tags" entityType="tag" />
        </Col>
        <Col xs={12} md={6}>
          <TrendingTable title="Trending Records" entityType="record" />
        </Col>
      </Row>
      <SummaryChart title="Tag Clicks Over Time" entityType="tag" eventType="click" />
      <CtrSection />
    </div>
  );
}
