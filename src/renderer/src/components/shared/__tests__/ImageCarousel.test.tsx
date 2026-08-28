import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  // TD-069: the expanded record's thumbnail rail drives the carousel, so
  // the index has to be somebody else's to hold. Every existing caller
  // passes neither prop and keeps the index it always had.
  it("shows the slide a controlling caller names", () => {
    const { container, rerender } = render(<ImageCarousel images={IMAGES} index={1} />);

    expect(activeIndex(container)).toBe(1);
    rerender(<ImageCarousel images={IMAGES} index={0} />);
    expect(activeIndex(container)).toBe(0);
  });

  it("reports where its own controls would go rather than going there", async () => {
    const user = userEvent.setup();
    const onIndexChange = vi.fn();
    const { container } = render(
      <ImageCarousel images={IMAGES} index={0} onIndexChange={onIndexChange} showControls />
    );

    await user.click(screen.getByRole("button", { name: "Next image" }));

    expect(onIndexChange).toHaveBeenCalledWith(1);
    expect(activeIndex(container)).toBe(0);
  });

  it("draws a slide's label in place of a picture it has no URL for", () => {
    const { getByText } = render(
      <ImageCarousel images={[{ imageKey: "slot-2", label: "Failed" }]} />
    );

    expect(getByText("Failed")).toBeInTheDocument();
  });
});
