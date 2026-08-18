import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatMarkdown from "../ChatMarkdown";

/**
 * TD-067. Two halves: the model's formatting reaches the user as elements, and
 * the model's *input* never reaches the user as markup — `text` is authored by
 * an LLM and is untrusted at this boundary.
 */
describe("ChatMarkdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "thunder");
  });

  function openExternal(): ReturnType<typeof vi.fn> {
    const spy = vi.fn(async () => true);
    Object.defineProperty(window, "thunder", {
      configurable: true,
      value: { shell: { openExternal: spy } },
    });
    return spy;
  }

  // The four answers TD-065's test plan produced against thunder-context-dev.
  it("renders bold rather than literal asterisks", () => {
    const { container } = render(<ChatMarkdown text="There are **25 actors** in the catalogue." />);

    expect(container.querySelector("strong")).toHaveTextContent("25 actors");
    expect(container.textContent).not.toContain("**");
  });

  it("renders italics and inline code", () => {
    const { container } = render(<ChatMarkdown text="*Tester* uses `get_record`." />);

    expect(container.querySelector("em")).toHaveTextContent("Tester");
    expect(container.querySelector("code")).toHaveTextContent("get_record");
  });

  it("renders a bullet list as list items", () => {
    const { container } = render(<ChatMarkdown text={"Movies:\n\n- Tester\n- Halo Movie"} />);

    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.textContent).not.toContain("- Tester");
  });

  it("renders a numbered list", () => {
    const { container } = render(<ChatMarkdown text={"1. first\n2. second"} />);

    expect(container.querySelector("ol")).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  // GFM, and the construct that reads worst unrendered.
  it("renders a pipe table as a table", () => {
    const table = "| Movie | Clicks |\n|---|---|\n| Tester | 2 |\n| Halo Movie | — |";
    const { container } = render(<ChatMarkdown text={table} />);

    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.textContent).not.toContain("|---|");
  });

  it("renders a fenced code block", () => {
    const { container } = render(<ChatMarkdown text={"```\nsearch_records\n```"} />);

    expect(container.querySelector("pre code")).toHaveTextContent("search_records");
  });

  // A chat turn is not a document — an h1 in the transcript wrecks the scale.
  it("renders a heading as emphasis, not a heading element", () => {
    const { container } = render(<ChatMarkdown text="# Top movies" />);

    expect(container.querySelector("h1")).not.toBeInTheDocument();
    expect(screen.getByText("Top movies").tagName).toBe("STRONG");
  });

  it("leaves plain prose as plain prose", () => {
    const { container } = render(<ChatMarkdown text="Eleven actors." />);

    expect(container.textContent).toBe("Eleven actors.");
    expect(container.querySelector("strong")).not.toBeInTheDocument();
  });

  // ─── Untrusted input ──────────────────────────────────────────────

  it("renders raw HTML inert rather than as markup", () => {
    const { container } = render(
      <ChatMarkdown text={'<script>alert(1)</script><img src=x onerror="alert(1)">'} />
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.textContent).toContain("alert(1)");
  });

  it("drops a javascript: link but keeps its text", () => {
    const { container } = render(<ChatMarkdown text="[click me](javascript:alert(1))" />);

    expect(container.querySelector("a")).not.toBeInTheDocument();
    expect(screen.getByText("click me")).toBeInTheDocument();
  });

  it("drops a data: link", () => {
    const { container } = render(
      <ChatMarkdown text="[x](data:text/html;base64,PHNjcmlwdD4=)" />
    );

    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("keeps an https link and opens it through the OS, not the renderer", async () => {
    const spy = openExternal();
    render(<ChatMarkdown text="[Halo](https://halo.swaff.name/records)" />);

    const link = screen.getByRole("link", { name: "Halo" });
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));

    await userEvent.click(link);

    expect(spy).toHaveBeenCalledWith("https://halo.swaff.name/records");
  });

  // Navigating the renderer to a model-authored URL should not be reachable.
  it("does not navigate the renderer when a link is clicked", async () => {
    openExternal();
    render(<ChatMarkdown text="[Halo](https://halo.swaff.name/)" />);

    const clicked = await userEvent.click(screen.getByRole("link", { name: "Halo" }));
    void clicked;

    expect(window.location.href).not.toContain("halo.swaff.name");
  });

  it("survives IPC being unavailable", async () => {
    render(<ChatMarkdown text="[Halo](https://halo.swaff.name/)" />);

    await expect(
      userEvent.click(screen.getByRole("link", { name: "Halo" }))
    ).resolves.not.toThrow();
  });
});
