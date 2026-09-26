import { describe, expect, it } from "vitest";
import {
  documentTextToWords,
  fingerprintText,
  normalizeDocumentText,
} from "../../src/ts/document-practice/normalize";

describe("document practice normalization", () => {
  it("normalizes line endings, tabs, and non-breaking spaces", () => {
    expect(normalizeDocumentText("  one\r\n two\t words\u00a0 ")).toBe(
      "one\n two words",
    );
  });

  it("preserves line boundaries in the custom-text word stream", () => {
    expect(documentTextToWords("one two\nthree\n\nfour")).toEqual([
      "one",
      "two\n",
      "three\n",
      "\n",
      "four",
    ]);
  });

  it("creates stable fingerprints", () => {
    expect(fingerprintText("same")).toBe(fingerprintText("same"));
    expect(fingerprintText("same")).not.toBe(fingerprintText("different"));
  });
});
