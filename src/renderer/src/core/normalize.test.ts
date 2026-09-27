import { describe, expect, it } from "vitest";
import { normalizeDocumentText, wordCount } from "./normalize";

describe("normalizeDocumentText", () => {
  it("collapses CRLF and lone CR into LF", () => {
    expect(normalizeDocumentText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
  });

  it("collapses runs of spaces and tabs but keeps newlines", () => {
    expect(normalizeDocumentText("a   b\t\tc\nd")).toBe("a b c\nd");
  });

  it("trims trailing whitespace on each line and the whole string", () => {
    expect(normalizeDocumentText("  a  \n  b  \n  ")).toBe("a\n b");
  });

  it("replaces non-breaking and zero-width spaces with a regular space", () => {
    expect(normalizeDocumentText("a b​c")).toBe("a b c");
  });

  it("spells out Greek letters and math symbols as keyboardable words", () => {
    expect(normalizeDocumentText("π ≈ 3.14")).toBe("pi approximately 3.14");
    expect(normalizeDocumentText("a × b ÷ c")).toBe("a times b divided by c");
  });

  it("is idempotent on already-normalized text", () => {
    const once = normalizeDocumentText("The rate is π × 2, roughly.");
    expect(normalizeDocumentText(once)).toBe(once);
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(wordCount("one two three")).toBe(3);
  });

  it("ignores extra whitespace and blank input", () => {
    expect(wordCount("  one    two  ")).toBe(2);
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
  });

  it("counts a spelled-out symbol as its own word", () => {
    expect(wordCount("a × b")).toBe(3);
  });
});
