import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render } from "@testing-library/react";
import ImageCarousel from "../ImageCarousel";

const IMAGES = [
  { url: "https://example.test/one.jpg", imageKey: "one" },
  { url: "https://example.test/two.jpg", imageKey: "two" },
];

function activeIndex(container: HTMLElement): number {
  const slides = [...container.querySelectorAll(".carousel-image")];
  return slides.findIndex((slide) => slide.classList.contains("active"));
}

describe("ImageCarousel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still auto-advances for callers that pass no autoAdvance prop", () => {
    vi.useFakeTimers();
    const { container } = render(<ImageCarousel images={IMAGES} />);

    expect(activeIndex(container)).toBe(0);
    act(() => vi.advanceTimersByTime(3000));
    expect(activeIndex(container)).toBe(1);
  });

  it("stays put when autoAdvance is off", () => {
    vi.useFakeTimers();
    const { container } = render(<ImageCarousel images={IMAGES} autoAdvance={false} />);

    act(() => vi.advanceTimersByTime(9000));
    expect(activeIndex(container)).toBe(0);
  });

  it("draws a slide's label in place of a picture it has no URL for", () => {
    const { getByText } = render(
      <ImageCarousel images={[{ imageKey: "slot-2", label: "Failed" }]} />
    );

    expect(getByText("Failed")).toBeInTheDocument();
  });
});
