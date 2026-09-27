import { describe, expect, it, vi } from "vitest";
import type { PickedFile } from "../../../shared/types";

// mammoth ships separate Node and browser builds; the app always runs the
// browser one (verified against the built bundle), but that entry point
// isn't reachable from Vitest's Node-based module resolution. Mock it here
// so this test covers extract.ts's own routing/plumbing, not mammoth's zip
// parsing (which is mammoth's own test suite's job).
vi.mock("mammoth", () => ({
  extractRawText: vi.fn(async ({ arrayBuffer }: { arrayBuffer: ArrayBuffer }) => ({
    value: new TextDecoder().decode(arrayBuffer),
  })),
}));

const { extractDocument } = await import("./extract"); // after vi.mock (hoisted above this line by vitest)

function pickedFile(name: string, bytes: Uint8Array): PickedFile {
  return { name, path: `/fixtures/${name}`, bytes };
}

describe("extractDocument", () => {
  it("routes .docx files through mammoth and normalizes the result", async () => {
    const bytes = new TextEncoder().encode("Paragraph one.\n\nParagraph   two.");
    const result = await extractDocument(pickedFile("resume.docx", bytes));
    expect(result.kind).toBe("docx");
    expect(result.title).toBe("resume.docx");
    expect(result.text).toBe("Paragraph one.\n\nParagraph two.");
  });

  it("extracts plain text files as-is (normalized)", async () => {
    const bytes = new TextEncoder().encode("Hello   world.\n\nSecond line.");
    const result = await extractDocument(pickedFile("notes.txt", bytes));
    expect(result.kind).toBe("text");
    expect(result.text).toBe("Hello world.\n\nSecond line.");
  });

  it("strips scripts/styles and reads visible text from HTML files", async () => {
    const html = "<html><body><style>body{color:red}</style><h1>Title</h1><script>alert(1)</script><p>Body text.</p></body></html>";
    const bytes = new TextEncoder().encode(html);
    const result = await extractDocument(pickedFile("page.html", bytes));
    expect(result.kind).toBe("html");
    expect(result.text).not.toContain("alert(1)");
    expect(result.text).toContain("Title");
    expect(result.text).toContain("Body text.");
  });

  it("rejects unsupported file types", async () => {
    const bytes = new TextEncoder().encode("binary-ish content");
    await expect(extractDocument(pickedFile("archive.zip", bytes))).rejects.toThrow(/unsupported file type/i);
  });
});
