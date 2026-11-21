import { describe, expect, it } from "vitest";
import { flagEmojiOf } from "../flagEmoji";

describe("flagEmojiOf", () => {
  it.each([
    ["AU", "\u{1F1E6}\u{1F1FA}"],
    ["US", "\u{1F1FA}\u{1F1F8}"],
    ["GB", "\u{1F1EC}\u{1F1E7}"],
  ])("maps %s to its regional indicator pair", (code, flag) => {
    expect(flagEmojiOf(code)).toBe(flag);
  });

  it("upper-cases the code first", () => {
    expect(flagEmojiOf("au")).toBe("\u{1F1E6}\u{1F1FA}");
  });
});
