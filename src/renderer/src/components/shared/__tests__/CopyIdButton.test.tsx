import { describe, expect, it, vi, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CopyIdButton from "../CopyIdButton";

function stubClipboard(writeText: () => Promise<void>) {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("CopyIdButton", () => {
  it("writes the id to the clipboard and shows the copied state", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    render(<CopyIdButton id="rec-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Copy ID" }));

    expect(writeText).toHaveBeenCalledWith("rec-1");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("reverts the copied state after the flash", async () => {
    stubClipboard(async () => {});
    vi.useFakeTimers();
    render(<CopyIdButton id="rec-1" label="Copy record ID" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy record ID" }));
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByRole("button", { name: "Copy record ID" })).toBeInTheDocument();
  });

  it("stays idle when the clipboard write is rejected", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    stubClipboard(writeText);
    render(<CopyIdButton id="rec-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Copy ID" }));

    expect(writeText).toHaveBeenCalledWith("rec-1");
    expect(screen.getByRole("button", { name: "Copy ID" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copied" })).not.toBeInTheDocument();
  });
});
