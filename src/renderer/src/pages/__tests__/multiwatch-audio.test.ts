import { describe, expect, it } from "vitest";
import { isMuted, resolveActiveId } from "../multiwatch-audio";

const IDS = ["a", "b", "c"];

describe("resolveActiveId", () => {
  it("gives the audio to the first cell before anyone has asked", () => {
    expect(resolveActiveId(IDS, null)).toBe("a");
  });

  it("gives it to the cell that asked", () => {
    expect(resolveActiveId(IDS, "c")).toBe("c");
  });

  it("falls back to the first cell when the requested one is gone", () => {
    expect(resolveActiveId(IDS, "gone")).toBe("a");
  });

  it("has no answer for an empty grid", () => {
    expect(resolveActiveId([], "a")).toBeNull();
  });

  it("leaves exactly one cell unmuted, whatever was requested", () => {
    for (const requested of [null, "a", "b", "c", "gone"]) {
      const activeId = resolveActiveId(IDS, requested);
      expect(IDS.filter((id) => !isMuted(id, activeId))).toHaveLength(1);
    }
  });
});

describe("isMuted", () => {
  it("mutes every cell but the active one", () => {
    expect(isMuted("a", "a")).toBe(false);
    expect(isMuted("b", "a")).toBe(true);
  });

  it("mutes everything when no cell is active", () => {
    expect(isMuted("a", null)).toBe(true);
  });
});
