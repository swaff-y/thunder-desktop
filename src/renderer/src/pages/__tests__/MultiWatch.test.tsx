import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ContentRecord } from "../../types";
import MultiWatch from "../MultiWatch";

const navigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigate };
});

vi.mock("../../api/halo", () => ({
  buildAuthProxyUrl: (id: string) => `https://halo.test/v1/proxy/${id}`,
  watchRecord: vi.fn(async () => {}),
  likeRecord: vi.fn(async () => {}),
}));

const ITEMS = ["one", "two", "three"].map(
  (name, index): ContentRecord => ({
    id: `id-${index}`,
    name,
    actors: [],
    tags: [],
    images: [],
  })
);

vi.mock("../../hooks/useCart", () => ({
  useCart: () => ({ items: ITEMS }),
}));

function renderGrid(): HTMLElement {
  const { container } = render(
    <MemoryRouter>
      <MultiWatch />
    </MemoryRouter>
  );
  return container;
}

function videos(container: HTMLElement): HTMLVideoElement[] {
  return [...container.querySelectorAll("video")];
}

function expandedCell(container: HTMLElement): Element | null {
  return container.querySelector(".multi-watch-cell--expanded");
}

/** Identity, not equality: two fresh elements with the same `src` compare equal. */
function expectSamePlayers(container: HTMLElement, before: HTMLVideoElement[]): void {
  const now = videos(container);
  expect(now).toHaveLength(before.length);
  before.forEach((video, index) => expect(now[index]).toBe(video));
}

describe("MultiWatch audio focus", () => {
  it("starts with the first cell audible and the rest muted", () => {
    const container = renderGrid();
    expect(videos(container).map((video) => video.muted)).toEqual([false, true, true]);
  });

  it("moves the audio to whichever speaker toggle is pressed", async () => {
    const user = userEvent.setup();
    const container = renderGrid();

    await user.click(screen.getByRole("button", { name: "Audio from three" }));
    expect(videos(container).map((video) => video.muted)).toEqual([true, true, false]);

    await user.click(screen.getByRole("button", { name: "Audio from two" }));
    expect(videos(container).map((video) => video.muted)).toEqual([true, false, true]);
  });

  it("marks the audible cell for the eye as well as the ear", async () => {
    const user = userEvent.setup();
    const container = renderGrid();

    await user.click(screen.getByRole("button", { name: "Audio from two" }));

    expect(container.querySelectorAll(".multi-watch-cell--active")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Audio from two" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("keeps the transport out of the grid so nothing else can write mute", () => {
    const container = renderGrid();
    expect(videos(container).every((video) => !video.hasAttribute("controls"))).toBe(true);
  });

  it("takes mute back off the native control bar", () => {
    const container = renderGrid();
    const [audible] = videos(container);

    audible.muted = true;
    audible.dispatchEvent(new Event("volumechange"));

    expect(audible.muted).toBe(false);
  });
});

describe("MultiWatch expand", () => {
  // Same elements, not merely equal `src`es: a remount would re-request
  // /v1/proxy/:id, and re-requesting is what saturates the socket pool.
  it("expands and collapses without replacing a single player", async () => {
    const user = userEvent.setup();
    const container = renderGrid();
    const before = videos(container);

    await user.click(screen.getByRole("button", { name: "Expand two" }));
    expect(expandedCell(container)).toBeInTheDocument();
    expectSamePlayers(container, before);

    await user.click(screen.getByRole("button", { name: "Collapse two" }));
    expect(expandedCell(container)).toBeNull();
    expectSamePlayers(container, before);
  });

  it("takes the background cells out of the tab order while one is expanded", async () => {
    const user = userEvent.setup();
    const container = renderGrid();
    const cells = () => [...container.querySelectorAll(".multi-watch-cell")];

    expect(cells().some((cell) => cell.hasAttribute("inert"))).toBe(false);

    await user.click(screen.getByRole("button", { name: "Expand two" }));

    expect(cells().map((cell) => cell.hasAttribute("inert"))).toEqual([true, false, true]);
  });

  it("gives the expanded cell the audio and the transport", async () => {
    const user = userEvent.setup();
    const container = renderGrid();

    await user.click(screen.getByRole("button", { name: "Expand three" }));

    expect(videos(container).map((video) => video.muted)).toEqual([true, true, false]);
    expect(videos(container)[2]).toHaveAttribute("controls");
  });

  it("expands on a double-click of the cell", async () => {
    const user = userEvent.setup();
    const container = renderGrid();

    await user.dblClick(container.querySelectorAll(".multi-watch-cell")[1]);

    expect(expandedCell(container)).toHaveClass("multi-watch-cell--active");
  });

  it("hides Back while expanded so collapse is the only way out", async () => {
    const user = userEvent.setup();
    renderGrid();

    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand two" }));
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("collapses on Escape without navigating, and keeps the same sources", async () => {
    const user = userEvent.setup();
    const container = renderGrid();
    const before = videos(container).map((video) => video.src);

    await user.click(screen.getByRole("button", { name: "Expand two" }));
    await user.keyboard("{Escape}");

    expect(expandedCell(container)).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(videos(container).map((video) => video.src)).toEqual(before);
  });

  it("leaves the keyboard on the cell's own control across expand and collapse", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(screen.getByRole("button", { name: "Expand two" }));
    expect(screen.getByRole("button", { name: "Collapse two" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Expand two" })).toHaveFocus();
  });

  it("still takes Back out of the grid", async () => {
    const user = userEvent.setup();
    renderGrid();

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(navigate).toHaveBeenCalledWith(-1);
  });
});
