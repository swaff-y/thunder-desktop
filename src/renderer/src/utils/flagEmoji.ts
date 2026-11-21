const REGIONAL_INDICATOR_A = 0x1f1e6;
const LETTER_A = "A".charCodeAt(0);

export function flagEmojiOf(code: string): string {
  return Array.from(code.toUpperCase(), (letter) =>
    String.fromCodePoint(REGIONAL_INDICATOR_A + letter.charCodeAt(0) - LETTER_A)
  ).join("");
}
