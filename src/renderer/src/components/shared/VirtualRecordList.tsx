// Desktop-only port — web-thunder's mobile branch is intentionally dropped (TD-010).
import { useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import DesktopCard from "../desktop/DesktopCard";
import type { ContentRecord } from "../../types";

interface VirtualRecordListProps {
  records: ContentRecord[];
}

const DESKTOP_COLS = 4;
const DESKTOP_ROW_HEIGHT = 280;

export default function VirtualRecordList({
  records,
}: VirtualRecordListProps) {
  const rowCount = Math.ceil(records.length / DESKTOP_COLS);

  const getScrollElement = useCallback(
    () => document.querySelector<HTMLElement>(".desktop-content"),
    []
  );

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement,
    estimateSize: () => DESKTOP_ROW_HEIGHT,
    overscan: 3,
  });

  return (
    <div
      style={{
        height: virtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
        minWidth: 0,
      }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const startIdx = virtualRow.index * DESKTOP_COLS;
        const rowRecords = records.slice(startIdx, startIdx + DESKTOP_COLS);

        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="virtual-grid-row"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {rowRecords.map((record, i) => (
              <div key={record.id ?? startIdx + i}>
                <DesktopCard record={record} />
              </div>
            ))}
          </div>
        );
      })}

      <style>{`
        .virtual-grid-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1rem;
          padding-bottom: 1rem;
        }
        .virtual-grid-row > * {
          min-width: 0;
        }
      `}</style>
    </div>
  );
}
