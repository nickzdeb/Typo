import type { DocumentKind, PickedFile } from "../../../shared/types";
import { normalizeDocumentText } from "./normalize";

export type ExtractedDocument = {
  kind: DocumentKind;
  title: string;
  text: string;
};

function isPdf(file: PickedFile): boolean {
  return /\.pdf$/i.test(file.name);
}

function isDocx(file: PickedFile): boolean {
  return /\.docx$/i.test(file.name);
}

function isPptx(file: PickedFile): boolean {
  return /\.pptx$/i.test(file.name);
}

function isHtml(file: PickedFile): boolean {
  return /\.(html?|xhtml)$/i.test(file.name);
}

function isPlainText(file: PickedFile): boolean {
  return /\.(txt|md|markdown)$/i.test(file.name);
}

function extractHtmlText(source: string): string {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  for (const element of parsed.querySelectorAll("script, style, noscript, svg")) {
    element.remove();
  }
  return parsed.body?.innerText || parsed.body?.textContent || source;
}

async function extractPdfText(file: PickedFile): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.mjs?url");
  GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await getDocument(
    Object.assign({ data: file.bytes.slice().buffer }, { enableScripting: false }),
  ).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const content = await pdf.getPage(pageNumber).then((page) => page.getTextContent());
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
    const sorted = [...items].sort((a, b) => {
      const y = (b.transform[5] ?? 0) - (a.transform[5] ?? 0);
      return Math.abs(y) > 3 ? y : (a.transform[4] ?? 0) - (b.transform[4] ?? 0);
    });
    const lines: { y: number; text: string }[] = [];
    for (const item of sorted) {
      const y = item.transform[5] ?? 0;
      const previous = lines.at(-1);
      if (previous !== undefined && Math.abs(previous.y - y) <= 3) {
        const space = previous.text.length > 0 && !/\s$/.test(previous.text) && !/^[,.;:!?%)\]}]/.test(item.str);
        previous.text += (space ? " " : "") + item.str;
      } else {
        lines.push({ y, text: item.str });
      }
    }
    pages.push(lines.map((line) => line.text.trim()).filter(Boolean).join("\n"));
  }

  return pages.join("\n\n");
}

async function extractDocxText(file: PickedFile): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: file.bytes.slice().buffer });
  return result.value;
}

async function extractPptxText(file: PickedFile): Promise<string> {
  const { parsePptx } = await import("./pptx");
  const slides = await parsePptx(file.bytes);
  // Equations and images are intentionally excluded here — they're shown in the
  // slide preview pane, never as typing text (see components/PptxPreview.tsx).
  return slides.map((slide) => slide.text).join("\n\n");
}

export async function extractDocument(file: PickedFile): Promise<ExtractedDocument> {
  let text: string;
  let kind: DocumentKind;
  if (isPdf(file)) {
    kind = "pdf";
    text = await extractPdfText(file);
  } else if (isDocx(file)) {
    kind = "docx";
    text = await extractDocxText(file);
  } else if (isPptx(file)) {
    kind = "pptx";
    text = await extractPptxText(file);
  } else {
    if (!isHtml(file) && !isPlainText(file)) {
      throw new Error("Unsupported file type. Choose TXT, Markdown, HTML, DOCX, PPTX, or PDF.");
    }
    const source = new TextDecoder().decode(file.bytes);
    kind = isHtml(file) ? "html" : "text";
    text = isHtml(file) ? extractHtmlText(source) : source;
  }
  return { kind, title: file.name, text: normalizeDocumentText(text) };
}
