import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
const openInBrowserTab = vi.fn();

vi.mock("../../../browser/BrowserNavContext", () => ({
  useOpenInBrowserTab: () => openInBrowserTab,
}));

/** Every TOM_HARDY_IMAGES fixture is a gif; a still needs its own. */
const SYDNEY_PHOTO = {
  image_url: "https://static.example.test/photos/sydney-opera-house.jpg",
  thumbnail_url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSydney&s=10",
  width: 800,
  height: 600,
  source_host: "static.example.test",
  title: "Sydney Opera House at dusk",
};

function tiles(): HTMLImageElement[] {
  return screen.getAllByRole("img");
}

beforeEach(() => {
  requestUploadUrl.mockClear();
  putUpload.mockClear();
  fetchEntity.mockClear();
  useActionImages.mockClear();
  openExternal.mockClear();
  openInBrowserTab.mockClear();
  Object.defineProperty(window, "thunder", {
    configurable: true,
    value: { shell: { openExternal } },
  });
});

describe("ActionCardWebImages", () => {
  it("draws a tile per candidate", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    expect(screen.getByRole("heading", { name: "Images from the web" })).toBeInTheDocument();
    expect(tiles()).toHaveLength(5);
  });

  it("shows the search engine's thumbnail for a still image", () => {
    const [, ...rest] = TOM_HARDY_IMAGES;
    render(
      <ActionCardWebImages action={webImagesAction("photos of Sydney", [SYDNEY_PHOTO, ...rest])} />
    );

    expect(tiles()[0]).toHaveAttribute("src", SYDNEY_PHOTO.thumbnail_url);
  });

  it("shows the animated original for a gif, not the engine's flattened still", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    expect(tiles().map((img) => img.getAttribute("src"))).toEqual(
      TOM_HARDY_IMAGES.map((image) => image.image_url)
    );
  });

  it("reads the extension past a query string", () => {
    const withQuery = TOM_HARDY_IMAGES[1];

    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    expect(withQuery.image_url as string).toContain("?resize=");
    expect(tiles()[1]).toHaveAttribute("src", withQuery.image_url as string);
  });

  it("falls back to the full-size URL when the provider gave no thumbnail", () => {
    const [, ...rest] = TOM_HARDY_IMAGES;
    const noThumbnail = { ...SYDNEY_PHOTO, thumbnail_url: undefined };
    render(
      <ActionCardWebImages action={webImagesAction("photos of Sydney", [noThumbnail, ...rest])} />
    );

    expect(tiles()[0]).toHaveAttribute("src", SYDNEY_PHOTO.image_url);
  });

  it("names the host every picture came from", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    for (const image of TOM_HARDY_IMAGES) {
      expect(screen.getByText(image.source_host as string)).toBeInTheDocument();
    }
  });

  it("shows the thumbnail when a host refuses the hotlink, keeping the tile", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    fireEvent.error(tiles()[0]);

    expect(tiles()).toHaveLength(5);
    expect(tiles()[0]).toHaveAttribute("src", TOM_HARDY_IMAGES[0].thumbnail_url as string);
  });

  it("drops a tile once no source is left and leaves the rest of the grid", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    fireEvent.error(tiles()[0]);
    fireEvent.error(tiles()[0]);

    expect(tiles()).toHaveLength(4);
    expect(screen.queryByText(TOM_HARDY_IMAGES[0].source_host as string)).not.toBeInTheDocument();
    expect(screen.getByText(TOM_HARDY_IMAGES[1].source_host as string)).toBeInTheDocument();
  });

  it("demotes one rung however many times a single broken URL errors", () => {
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    const tile = tiles()[0];
    act(() => {
      tile.dispatchEvent(new Event("error"));
      tile.dispatchEvent(new Event("error"));
    });

    expect(tiles()).toHaveLength(5);
    expect(tiles()[0]).toHaveAttribute("src", TOM_HARDY_IMAGES[0].thumbnail_url as string);
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

  it("opens the full-size image in the app's own Browser tab", async () => {
    const user = userEvent.setup();
    render(<ActionCardWebImages action={webImagesAction("gifs of Tom Hardy")} />);

    await user.click(screen.getAllByRole("button")[0]);

    expect(openInBrowserTab).toHaveBeenCalledWith(TOM_HARDY_IMAGES[0].image_url);
    expect(openExternal).not.toHaveBeenCalled();
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
