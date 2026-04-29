import { Row, Col } from "react-bootstrap";
import DesktopCard from "./DesktopCard";
import type { ContentRecord } from "../../types";

interface ContentGridProps {
  records: ContentRecord[];
}

export default function ContentGrid({ records }: ContentGridProps) {
  return (
    <Row xs={2} md={3} lg={4} className="g-3">
      {records.map((record, i) => (
        <Col key={record.id ?? i}>
          <DesktopCard record={record} />
        </Col>
      ))}
    </Row>
  );
}
