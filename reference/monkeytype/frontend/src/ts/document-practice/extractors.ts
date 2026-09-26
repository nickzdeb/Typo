import type { ExtractedDocument } from "./types";
import { fingerprintText, normalizeDocumentText } from "./normalize";

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isHtml(file: File): boolean {
  return file.type === "text/html" || /\.(html?|xhtml)$/i.test(file.name);
}

function extractHtmlText(source: string): string {
  if (typeof DOMParser === "undefined") return source;
  const parsed = new DOMParser().parseFromString(source, "text/html");
  for (const element of parsed.querySelectorAll("script, style, noscript, svg")) {
    element.remove();
  }
  return parsed.body?.innerText || parsed.body?.textContent || source;
}

export async function extractLocalFile(file: File): Promise<ExtractedDocument> {
  if (!isPdf(file)) {
    const source = await file.text();
    return {
      title: file.name,
      text: normalizeDocumentText(isHtml(file) ? extractHtmlText(source) : source),
      warnings: [],
    };
  }

  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  const workerModule = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const pdf = await getDocument(
    Object.assign({ data: await file.arrayBuffer() }, { enableScripting: false }),
  ).promise;
  const pages: string[] = [];
  const warnings: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.filter(
      (item): item is {
        str: string;
        dir: string;
        transform: number[];
        width: number;
        height: number;
        fontName: string;
        hasEOL: boolean;
      } => "str" in item && "transform" in item,
    );

    if (items.length === 0) {
      warnings.push("Page " + pageNumber + " has no extractable text; OCR may be required.");
      pages.push("");
      continue;
    }

    const sortedItems = [...items].sort((a, b) => {
      const yDifference = (b.transform[5] ?? 0) - (a.transform[5] ?? 0);
      if (Math.abs(yDifference) > 3) return yDifference;
      return (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
    });

    const lines: { y: number; x: number; text: string }[] = [];
    for (const item of sortedItems) {
      const x = item.transform[4] ?? 0;
      const y = item.transform[5] ?? 0;
      const previous = lines.at(-1);
      if (previous !== undefined && Math.abs(previous.y - y) <= 3) {
        const needsSpace =
          previous.text.length > 0 &&
          !/\s$/.test(previous.text) &&
          !/^[,.;:!?%)\]}]/.test(item.str);
        previous.text += (needsSpace ? " " : "") + item.str;
      } else {
        lines.push({ x, y, text: item.str });
      }
      if (item.hasEOL && lines.at(-1) !== undefined) {
        lines.at(-1)!.text += "\n";
      }
    }

    pages.push(lines.map((line) => line.text.trim()).filter(Boolean).join("\n"));
  }

  return {
    title: file.name,
    text: normalizeDocumentText(pages.join("\n\n")),
    pageCount: pdf.numPages,
    warnings,
  };
}

export async function importLocalFile(file: File) {
  const extracted = await extractLocalFile(file);
  const now = Date.now();
  const text = normalizeDocumentText(extracted.text);
  return {
    id: crypto.randomUUID(),
    title: extracted.title,
    kind: isPdf(file) ? ("pdf" as const) : ("text" as const),
    sourceName: file.name,
    text,
    fingerprint: fingerprintText(text),
    pageCount: extracted.pageCount,
    warnings: extracted.warnings,
    createdAt: now,
    updatedAt: now,
  };
}
