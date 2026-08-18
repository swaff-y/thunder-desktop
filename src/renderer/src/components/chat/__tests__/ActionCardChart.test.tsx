import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ActionCardChart from "../ActionCardChart";
import { chartAction } from "./fixtures";

/** The bar is decoration, so its width is read off the DOM, not the a11y tree. */
function barWidths(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>(".card-chart-bar")].map(
    (bar) => bar.style.width
  );
}

describe("ActionCardChart", () => {
  it("heads the card with the kind, the model's title and the source tool", () => {
    render(
      <ActionCardChart
        action={chartAction("get_top_entities", "Clicks by movie", "Clicks", [
          { name: "Alpha", value: 40 },
        ])}
      />
    );

    expect(screen.getByText("Action · chart")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clicks by movie" })).toBeInTheDocument();
    expect(screen.getByText("get_top_entities")).toBeInTheDocument();
  });

  it("sizes every bar against the largest, which fills its row", () => {
    const { container } = render(
      <ActionCardChart
        action={chartAction("get_top_entities", "Clicks by movie", "Clicks", [
          { name: "Alpha", value: 40 },
          { name: "Beta", value: 20 },
          { name: "Gamma", value: 10 },
        ])}
      />
    );

    expect(barWidths(container)).toEqual(["100%", "50%", "25%"]);
  });

  it("renders flat bars and zero values when nothing in the catalogue has been seen", () => {
    const { container } = render(
      <ActionCardChart
        action={chartAction("get_top_entities", "Clicks by movie", "Clicks", [
          { name: "Alpha", value: 0 },
          { name: "Beta", value: 0 },
        ])}
      />
    );

    expect(barWidths(container)).toEqual(["0%", "0%"]);
    expect(screen.getAllByRole("cell", { name: "0" })).toHaveLength(2);
  });

  it("carries every name and value as text, not only as a width", () => {
    render(
      <ActionCardChart
        action={chartAction("search_records", "Views by record", "Views", [
          { name: "Alpha", value: 1200 },
          { name: "Beta", value: 340 },
        ])}
      />
    );

    expect(screen.getByRole("rowheader", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1,200" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "340" })).toBeInTheDocument();
  });

  it("says all time only for the ranking tool, which is not a windowed metric", () => {
    const { unmount } = render(
      <ActionCardChart
        action={chartAction("get_top_entities", "Clicks by movie", "Clicks", [
          { name: "Alpha", value: 40 },
        ])}
      />
    );
    expect(screen.getByText("Clicks · top 1 · all time")).toBeInTheDocument();
    unmount();

    render(
      <ActionCardChart
        action={chartAction("search_records", "Views by record", "Views", [
          { name: "Alpha", value: 40 },
        ])}
      />
    );
    expect(screen.getByText("Views · top 1")).toBeInTheDocument();
  });

  it("renders nothing when the action carries no bars", () => {
    const { container } = render(
      <ActionCardChart action={chartAction("get_top_entities", "Empty", "Clicks", [])} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
