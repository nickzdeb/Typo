import JSZip from "jszip";
import { convertOmmlToMathml, linearizeOmml } from "./omml";

export type SlideEquation = { mathml: string; text: string };
export type SlideContent = { text: string; images: string[]; equations: SlideEquation[] };

const drawingNamespace = "http://schemas.openxmlformats.org/drawingml/2006/main";
const presentationNamespace = "http://schemas.openxmlformats.org/presentationml/2006/main";
const mathNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const relationshipsNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

async function readXml(zip: JSZip, path: string): Promise<Document | undefined> {
  const file = zip.file(path);
  if (file === null) return undefined;
  return parseXml(await file.async("text"));
}

function relsPathFor(entryPath: string): string {
  const lastSlash = entryPath.lastIndexOf("/");
  return `${entryPath.slice(0, lastSlash)}/_rels/${entryPath.slice(lastSlash + 1)}.rels`;
}

function resolvePath(fromEntryPath: string, relativeTarget: string): string {
  const baseDir = fromEntryPath.slice(0, fromEntryPath.lastIndexOf("/"));
  const resolved: string[] = [];
  for (const segment of [...baseDir.split("/"), ...relativeTarget.split("/")]) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") resolved.pop();
    else resolved.push(segment);
  }
  return resolved.join("/");
}

function resolveRelationshipTarget(relsDoc: Document, id: string): string | undefined {
  const match = Array.from(relsDoc.getElementsByTagName("Relationship")).find((rel) => rel.getAttribute("Id") === id);
  return match?.getAttribute("Target") ?? undefined;
}

function mimeForExtension(extension: string | undefined): string | undefined {
  switch (extension) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "bmp": return "image/bmp";
    case "webp": return "image/webp";
    default: return undefined; // e.g. emf/wmf: legacy vector formats browsers can't display directly
  }
}

function slideText(slideRoot: Element): string {
  const paragraphs = Array.from(slideRoot.getElementsByTagNameNS(drawingNamespace, "p"));
  const lines = paragraphs
    .map((paragraph) => Array.from(paragraph.getElementsByTagNameNS(drawingNamespace, "t")).map((run) => run.textContent ?? "").join(""))
    .filter((line) => line.trim().length > 0);
  return lines.join("\n");
}

async function slideImages(zip: JSZip, slideRoot: Element, relsDoc: Document | undefined, slidePath: string): Promise<string[]> {
  if (relsDoc === undefined) return [];
  const images: string[] = [];
  for (const pic of Array.from(slideRoot.getElementsByTagNameNS(presentationNamespace, "pic"))) {
    const blip = pic.getElementsByTagNameNS(drawingNamespace, "blip")[0];
    const embedId = blip?.getAttributeNS(relationshipsNamespace, "embed");
    if (embedId === null || embedId === undefined) continue;
    const target = resolveRelationshipTarget(relsDoc, embedId);
    if (target === undefined) continue;
    const resolvedPath = resolvePath(slidePath, target);
    const mime = mimeForExtension(/\.([a-zA-Z0-9]+)$/.exec(resolvedPath)?.[1]?.toLowerCase());
    if (mime === undefined) continue;
    const file = zip.file(resolvedPath);
    if (file === null) continue;
    images.push(`data:${mime};base64,${await file.async("base64")}`);
  }
  return images;
}

function slideEquations(slideRoot: Element): SlideEquation[] {
  return Array.from(slideRoot.getElementsByTagNameNS(mathNamespace, "oMath")).map((equation) => ({
    mathml: convertOmmlToMathml(equation),
    text: linearizeOmml(equation),
  }));
}

export async function parsePptx(bytes: Uint8Array): Promise<SlideContent[]> {
  const zip = await JSZip.loadAsync(bytes);
  const slidePaths = Object.keys(zip.files)
    .map((path) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(path))
    .filter((match): match is RegExpExecArray => match !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((match) => match[0]);

  const slides: SlideContent[] = [];
  for (const slidePath of slidePaths) {
    const slideDoc = await readXml(zip, slidePath);
    if (slideDoc === undefined) continue;
    const relsDoc = await readXml(zip, relsPathFor(slidePath));
    slides.push({
      text: slideText(slideDoc.documentElement),
      images: await slideImages(zip, slideDoc.documentElement, relsDoc, slidePath),
      equations: slideEquations(slideDoc.documentElement),
    });
  }
  return slides;
}
