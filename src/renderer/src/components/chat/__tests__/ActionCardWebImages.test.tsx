import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActionCardWebImages from "../ActionCardWebImages";
import { TOM_HARDY_IMAGES, webImagesAction } from "./fixtures";

const requestUploadUrl = vi.fn();
const putUpload = vi.fn();
const fetchEntity = vi.fn();
const useActionImages = vi.fn(() => ({ slides: [], isLoading: false, isError: false }));

vi.mock("../../../api/halo", () => ({
  requestUploadUrl: (...args: unknown[]) => requestUploadUrl(...args),
  putUpload: (...args: unknown[]) => putUpload(...args),
  fetchEntity: (...args: unknown[]) => fetchEntity(...args),
}));

vi.mock("../useActionImages", () => ({
  useActionImages: () => useActionImages(),
}));

const openExternal = vi.fn();

function tiles(): HTMLImageElement[] {
  return screen.getAllByRole("img");
}

beforeEach(() => {
  requestUploadUrl.mockClear();
  putUpload.mockClear();
  fetchEntity.mockClear();
  useActionImages.mockClear();
  openExternal.mockClear();
  Object.defineProperty(window, "thunder", {
    configurable: true,
    value: { shell: { openExternal } },
  });
});

describe("ActionCardWebImages", () => {
  it("draws a tile per candidate, each showing the search engine's thumbnail", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    expect(screen.getByRole("heading", { name: "Images from the web" })).toBeInTheDocument();
    expect(tiles()).toHaveLength(5);
    expect(tiles().map((img) => img.getAttribute("src"))).toEqual(
      TOM_HARDY_IMAGES.map((image) => image.thumbnail_url)
    );
  });

  it("falls back to the full-size URL when the provider gave no thumbnail", () => {
    const [first, ...rest] = TOM_HARDY_IMAGES;
    const noThumbnail = { ...first, thumbnail_url: undefined };
    render(
      <ActionCardWebImages action={webImagesAction("gifs of Tom Hardy", [noThumbnail, ...rest])} />
    );

    expect(tiles()[0]).toHaveAttribute("src", first.image_url as string);
  });

  it("names the host every picture came from", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    for (const image of TOM_HARDY_IMAGES) {
      expect(screen.getByText(image.source_host as string)).toBeInTheDocument();
    }
  });

  it("drops a tile whose image will not load and leaves the rest of the grid", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    fireEvent.error(tiles()[0]);

    expect(tiles()).toHaveLength(4);
    expect(screen.queryByText(TOM_HARDY_IMAGES[0].source_host as string)).not.toBeInTheDocument();
    expect(screen.getByText(TOM_HARDY_IMAGES[1].source_host as string)).toBeInTheDocument();
  });

  it("reserves the provider's ratio, and a square where it gave none", () => {
    const [first, ...rest] = TOM_HARDY_IMAGES;
    const noSize = { ...first, width: undefined, height: undefined };
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy", [noSize, ...rest])} />);

    expect(tiles()[0].style.aspectRatio).toBe("1");
    expect(tiles()[1].style.aspectRatio).toBe(String(500 / 280));
  });

  it("draws at most five tiles, whatever the search came back with", () => {
    const extras = [
      { ...TOM_HARDY_IMAGES[0], image_url: "https://example.test/six.gif" },
      { ...TOM_HARDY_IMAGES[0], image_url: "https://example.test/seven.gif" },
    ];
    render(
      <ActionCardWebImages
        action={webImagesAction("gifs of Tom Hardy", [...TOM_HARDY_IMAGES, ...extras])}
      />
    );

    expect(tiles()).toHaveLength(5);
  });

  it("truncates a page title long enough to overrun a tooltip", () => {
    const [first, ...rest] = TOM_HARDY_IMAGES;
    const longTitle = `Tom Hardy ${"very ".repeat(40)}long`;
    render(
      <ActionCardWebImages
        action={webImagesAction("gifs of Tom Hardy", [{ ...first, title: longTitle }, ...rest])}
      />
    );

    const alt = tiles()[0].getAttribute("alt") ?? "";
    expect(alt.length).toBeLessThan(longTitle.length);
    expect(alt.endsWith("…")).toBe(true);
    expect(screen.getAllByRole("button")[0]).toHaveAttribute("title", alt);
  });

  it("sends no referrer to the stranger's host that serves the bytes", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    for (const tile of tiles()) {
      expect(tile).toHaveAttribute("referrerpolicy", "no-referrer");
    }
  });

  it("opens the full-size image outside the renderer", async () => {
    const user = userEvent.setup();
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(openExternal).toHaveBeenCalledWith(TOM_HARDY_IMAGES[0].image_url);
  });

  it("draws nothing when the adapter will not vouch for the action", () => {
    const { container } = render(
      <ActionCardWebImages action={webImagesAction("gifs of Tom Hardy", [])} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("fetches nothing — the URLs are already in the transcript", () => {
    const { unmount } = render(
      <ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />
    );

    unmount();
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    expect(useActionImages).not.toHaveBeenCalled();
    expect(requestUploadUrl).not.toHaveBeenCalled();
    expect(putUpload).not.toHaveBeenCalled();
    expect(fetchEntity).not.toHaveBeenCalled();
  });
});
