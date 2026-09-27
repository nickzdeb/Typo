import JSZip from "jszip";
import { convertOmmlToMathml, linearizeOmml } from "./omml";

export type ContentBlock = { kind: "text"; text: string } | { kind: "equation"; mathml: string; text: string };

// left/top/width/height are percentages (0-100) of the slide's own width/height, ready to
// use directly as CSS. fontSizeCqw is in CSS container-query-width units (1cqw = 1% of the
// nearest ancestor with container-type set) — see components/PptxPreview.tsx.
export type SlideShape =
  | { kind: "textbox"; left: number; top: number; width: number; height: number; fontSizeCqw: number; blocks: ContentBlock[] }
  | { kind: "image"; left: number; top: number; width: number; height: number; src: string };

export type SlideContent = { shapes: SlideShape[]; text: string };
export type PptxDocument = { slideWidthEmu: number; slideHeightEmu: number; slides: SlideContent[] };

const drawingNamespace = "http://schemas.openxmlformats.org/drawingml/2006/main";
const presentationNamespace = "http://schemas.openxmlformats.org/presentationml/2006/main";
const mathNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const relationshipsNamespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const emuPerPoint = 12700;
// Standard 16:9 widescreen, used only if a deck's presentation.xml is somehow unreadable.
const defaultSlideWidthEmu = 12192000;
const defaultSlideHeightEmu = 6858000;

type Box = { left: number; top: number; width: number; height: number };

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

async function readXml(zip: JSZip, path: string): Promise<Document | undefined> {
  const file = zip.file(path);
  if (file === null) return undefined;
  return parseXml(await file.async("text"));
}

function childrenNamed(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function firstChildNamed(element: Element, localName: string): Element | undefined {
  return childrenNamed(element, localName)[0];
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

async function readSlideSize(zip: JSZip): Promise<{ width: number; height: number }> {
  const presentation = await readXml(zip, "ppt/presentation.xml");
  const sldSz = presentation?.getElementsByTagNameNS(presentationNamespace, "sldSz")[0];
  const width = Number(sldSz?.getAttribute("cx"));
  const height = Number(sldSz?.getAttribute("cy"));
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return { width, height };
  return { width: defaultSlideWidthEmu, height: defaultSlideHeightEmu };
}

function xfrmOf(element: Element): Element | undefined {
  const spPr = firstChildNamed(element, "spPr");
  return spPr !== undefined ? firstChildNamed(spPr, "xfrm") : undefined;
}

function percentBox(xfrm: Element, slideWidthEmu: number, slideHeightEmu: number): Box | undefined {
  const off = firstChildNamed(xfrm, "off");
  const ext = firstChildNamed(xfrm, "ext");
  if (off === undefined || ext === undefined) return undefined;
  const x = Number(off.getAttribute("x") ?? "0");
  const y = Number(off.getAttribute("y") ?? "0");
  const cx = Number(ext.getAttribute("cx") ?? "0");
  const cy = Number(ext.getAttribute("cy") ?? "0");
  return {
    left: (x / slideWidthEmu) * 100,
    top: (y / slideHeightEmu) * 100,
    width: (cx / slideWidthEmu) * 100,
    height: (cy / slideHeightEmu) * 100,
  };
}

// Many slides don't set an explicit position for title/body placeholders at all — they
// inherit it from the slide layout, which this parser doesn't resolve (that needs walking
// slideLayout -> slideMaster placeholder inheritance, a much bigger lift for a visual aid).
// Falls back to a plausible title-at-top / body-below-it layout instead of guessing nothing.
function fallbackBox(isTitle: boolean, cursor: { top: number }): Box {
  if (isTitle) return { left: 5, top: 4, width: 90, height: 16 };
  const top = cursor.top;
  const height = 22;
  cursor.top += height + 2;
  return { left: 5, top, width: 90, height };
}

function firstFontSize(txBody: Element): number | undefined {
  for (const rPr of Array.from(txBody.getElementsByTagNameNS(drawingNamespace, "rPr"))) {
    const sz = rPr.getAttribute("sz");
    if (sz !== null) return Number(sz);
  }
  return undefined;
}

// PowerPoint's own "shrink text on overflow" hint, in thousandths of a percent
// (fontScale="77500" = 77.5%). Absent (or an <a:normAutofit/> with no attribute) means 100%.
function autofitScale(txBody: Element): number {
  const bodyPr = firstChildNamed(txBody, "bodyPr");
  const normAutofit = bodyPr !== undefined ? firstChildNamed(bodyPr, "normAutofit") : undefined;
  const fontScale = normAutofit?.getAttribute("fontScale");
  if (fontScale === null || fontScale === undefined) return 1;
  const value = Number(fontScale) / 100000;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function extractBlocks(txBody: Element): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let pendingLines: string[] = [];
  const flush = (): void => {
    if (pendingLines.length > 0) {
      blocks.push({ kind: "text", text: pendingLines.join("\n") });
      pendingLines = [];
    }
  };
  for (const paragraph of childrenNamed(txBody, "p")) {
    const equation = paragraph.getElementsByTagNameNS(mathNamespace, "oMath")[0];
    if (equation !== undefined) {
      flush();
      blocks.push({ kind: "equation", mathml: convertOmmlToMathml(equation), text: linearizeOmml(equation) });
      continue;
    }
    const text = Array.from(paragraph.getElementsByTagNameNS(drawingNamespace, "t")).map((t) => t.textContent ?? "").join("");
    if (text.trim().length > 0) pendingLines.push(text);
  }
  flush();
  return blocks;
}

function placeholderType(sp: Element): string | undefined {
  const nvSpPr = firstChildNamed(sp, "nvSpPr");
  const nvPr = nvSpPr !== undefined ? firstChildNamed(nvSpPr, "nvPr") : undefined;
  const ph = nvPr !== undefined ? firstChildNamed(nvPr, "ph") : undefined;
  return ph?.getAttribute("type") ?? undefined;
}

function buildTextboxShape(sp: Element, box: Box | undefined, slideWidthEmu: number, cursor: { top: number }): SlideShape | undefined {
  const txBody = firstChildNamed(sp, "txBody");
  if (txBody === undefined) return undefined;
  const blocks = extractBlocks(txBody);
  if (blocks.length === 0) return undefined;
  const isTitle = placeholderType(sp) === "title" || placeholderType(sp) === "ctrTitle";
  const resolvedBox = box ?? fallbackBox(isTitle, cursor);
  const sz = firstFontSize(txBody) ?? (isTitle ? 4400 : 2800);
  const fontSizeCqw = ((sz / 100) * emuPerPoint / slideWidthEmu) * 100 * autofitScale(txBody);
  return { kind: "textbox", ...resolvedBox, fontSizeCqw, blocks };
}

async function buildImageShape(zip: JSZip, pic: Element, box: Box | undefined, relsDoc: Document | undefined, slidePath: string): Promise<SlideShape | undefined> {
  if (box === undefined || relsDoc === undefined) return undefined; // don't guess an image's position
  const blip = pic.getElementsByTagNameNS(drawingNamespace, "blip")[0];
  const embedId = blip?.getAttributeNS(relationshipsNamespace, "embed");
  if (embedId === null || embedId === undefined) return undefined;
  const target = resolveRelationshipTarget(relsDoc, embedId);
  if (target === undefined) return undefined;
  const resolvedPath = resolvePath(slidePath, target);
  const mime = mimeForExtension(/\.([a-zA-Z0-9]+)$/.exec(resolvedPath)?.[1]?.toLowerCase());
  if (mime === undefined) return undefined;
  const file = zip.file(resolvedPath);
  if (file === null) return undefined;
  return { kind: "image", ...box, src: `data:${mime};base64,${await file.async("base64")}` };
}

// A group shape (<p:grpSp>) places its children in its own local coordinate space
// (chOff/chExt) and maps that whole space onto a region of the slide (off/ext) — this is
// the standard OOXML group transform. Returns a function mapping a child's own xfrm into
// slide-percentage coordinates, or undefined if the group can't be mapped (no transform,
// or a degenerate zero-sized child space).
function groupTransform(grpSp: Element, slideWidthEmu: number, slideHeightEmu: number): ((child: Element) => Box | undefined) | undefined {
  const grpSpPr = firstChildNamed(grpSp, "grpSpPr");
  const xfrm = grpSpPr !== undefined ? firstChildNamed(grpSpPr, "xfrm") : undefined;
  if (xfrm === undefined) return undefined;
  const off = firstChildNamed(xfrm, "off");
  const ext = firstChildNamed(xfrm, "ext");
  const chOff = firstChildNamed(xfrm, "chOff");
  const chExt = firstChildNamed(xfrm, "chExt");
  if (off === undefined || ext === undefined || chOff === undefined || chExt === undefined) return undefined;
  const groupX = Number(off.getAttribute("x") ?? "0");
  const groupY = Number(off.getAttribute("y") ?? "0");
  const groupCx = Number(ext.getAttribute("cx") ?? "0");
  const groupCy = Number(ext.getAttribute("cy") ?? "0");
  const childOffX = Number(chOff.getAttribute("x") ?? "0");
  const childOffY = Number(chOff.getAttribute("y") ?? "0");
  const childExtCx = Number(chExt.getAttribute("cx") ?? "0");
  const childExtCy = Number(chExt.getAttribute("cy") ?? "0");
  if (childExtCx === 0 || childExtCy === 0) return undefined;
  const scaleX = groupCx / childExtCx;
  const scaleY = groupCy / childExtCy;

  return (child: Element) => {
    const childXfrm = xfrmOf(child);
    if (childXfrm === undefined) return undefined;
    const cOff = firstChildNamed(childXfrm, "off");
    const cExt = firstChildNamed(childXfrm, "ext");
    if (cOff === undefined || cExt === undefined) return undefined;
    const cx = Number(cOff.getAttribute("x") ?? "0");
    const cy = Number(cOff.getAttribute("y") ?? "0");
    const cw = Number(cExt.getAttribute("cx") ?? "0");
    const ch = Number(cExt.getAttribute("cy") ?? "0");
    const slideX = groupX + (cx - childOffX) * scaleX;
    const slideY = groupY + (cy - childOffY) * scaleY;
    return {
      left: (slideX / slideWidthEmu) * 100,
      top: (slideY / slideHeightEmu) * 100,
      width: ((cw * scaleX) / slideWidthEmu) * 100,
      height: ((ch * scaleY) / slideHeightEmu) * 100,
    };
  };
}

async function slideShapes(
  zip: JSZip,
  slideRoot: Element,
  relsDoc: Document | undefined,
  slidePath: string,
  slideWidthEmu: number,
  slideHeightEmu: number,
): Promise<SlideShape[]> {
  const spTree = slideRoot.getElementsByTagNameNS(presentationNamespace, "spTree")[0];
  if (spTree === undefined) return [];
  const shapes: SlideShape[] = [];
  const cursor = { top: 22 };

  async function handleSp(sp: Element, overrideBox: Box | undefined): Promise<void> {
    const box = overrideBox ?? (xfrmOf(sp) !== undefined ? percentBox(xfrmOf(sp)!, slideWidthEmu, slideHeightEmu) : undefined);
    const shape = buildTextboxShape(sp, box, slideWidthEmu, cursor);
    if (shape !== undefined) shapes.push(shape);
  }

  async function handlePic(pic: Element, overrideBox: Box | undefined): Promise<void> {
    const box = overrideBox ?? (xfrmOf(pic) !== undefined ? percentBox(xfrmOf(pic)!, slideWidthEmu, slideHeightEmu) : undefined);
    const shape = await buildImageShape(zip, pic, box, relsDoc, slidePath);
    if (shape !== undefined) shapes.push(shape);
  }

  for (const child of Array.from(spTree.children)) {
    if (child.localName === "sp") await handleSp(child, undefined);
    else if (child.localName === "pic") await handlePic(child, undefined);
    else if (child.localName === "grpSp") {
      const transform = groupTransform(child, slideWidthEmu, slideHeightEmu);
      if (transform === undefined) continue;
      for (const groupChild of Array.from(child.children)) {
        if (groupChild.localName === "sp") await handleSp(groupChild, transform(groupChild));
        else if (groupChild.localName === "pic") await handlePic(groupChild, transform(groupChild));
      }
    }
  }
  return shapes;
}

export async function parsePptx(bytes: Uint8Array): Promise<PptxDocument> {
  const zip = await JSZip.loadAsync(bytes);
  const { width: slideWidthEmu, height: slideHeightEmu } = await readSlideSize(zip);

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
    const shapes = await slideShapes(zip, slideDoc.documentElement, relsDoc, slidePath, slideWidthEmu, slideHeightEmu);
    const text = shapes
      .flatMap((shape) => (shape.kind === "textbox" ? shape.blocks.filter((block) => block.kind === "text").map((block) => block.text) : []))
      .join("\n");
    slides.push({ shapes, text });
  }
  return { slideWidthEmu, slideHeightEmu, slides };
}
