import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCopyId } from "../useCopyId";

function stubClipboard(writeText: () => Promise<void>) {
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useCopyId", () => {
  it("clears the pending timer when it unmounts inside the flash window", async () => {
    stubClipboard(async () => {});
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useCopyId("rec-1"));

    await act(async () => {
      result.current.copy();
    });
    expect(result.current.copied).toBe(true);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("neither writes nor flashes when the id is empty", async () => {
    const writeText = vi.fn(async () => {});
    stubClipboard(writeText);
    const { result } = renderHook(() => useCopyId(""));

    await act(async () => {
      result.current.copy();
    });

    expect(writeText).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(false);
  });
});
