// Converts a subset of Office Math Markup Language (OMML, the <m:...> equation
// format embedded in .docx/.pptx files) into MathML, which Chromium/Electron
// renders natively with no extra library. OMML and MathML are structurally
// close for the common constructs (runs, fractions, sub/superscripts, roots,
// delimiters, n-ary operators like sum/integral), so this is a direct
// recursive mapping, not a general-purpose equation engine. Anything outside
// that common subset (matrices, custom group characters, accents, ...) falls
// back to its flattened text inside <mtext>, so rendering never breaks — it
// just loses the special layout for that one piece.

function childrenNamed(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function firstChildNamed(element: Element, localName: string): Element | undefined {
  return childrenNamed(element, localName)[0];
}

function flattenText(element: Element): string {
  const texts = Array.from(element.getElementsByTagNameNS("*", "t"));
  return texts.map((node) => node.textContent ?? "").join("");
}

function classifyRun(text: string): "mn" | "mo" | "mi" {
  if (/^[0-9]+(\.[0-9]+)?$/.test(text)) return "mn";
  if (/^[+\-=<>≤≥±×÷·/(),.]+$/.test(text)) return "mo";
  return "mi";
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function convertRun(element: Element): string {
  const text = flattenText(element);
  if (text.length === 0) return "";
  const tag = classifyRun(text);
  return `<${tag}>${escapeXml(text)}</${tag}>`;
}

// The "base" of a construct (e.g. m:e) can itself contain multiple math nodes
// (usually a run, sometimes several) — wrap however many there are in one <mrow>.
function convertContainer(element: Element | undefined): string {
  if (element === undefined) return "<mrow/>";
  const parts = Array.from(element.children)
    .map((child) => convertNode(child))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return "<mrow/>";
  if (parts.length === 1) return parts[0];
  return `<mrow>${parts.join("")}</mrow>`;
}

function fallback(element: Element): string {
  const text = flattenText(element);
  return text.length === 0 ? "" : `<mtext>${escapeXml(text)}</mtext>`;
}

function convertFraction(element: Element): string {
  const num = firstChildNamed(element, "num");
  const den = firstChildNamed(element, "den");
  return `<mfrac>${convertContainer(num)}${convertContainer(den)}</mfrac>`;
}

function convertSuperscript(element: Element): string {
  const base = firstChildNamed(element, "e");
  const sup = firstChildNamed(element, "sup");
  return `<msup>${convertContainer(base)}${convertContainer(sup)}</msup>`;
}

function convertSubscript(element: Element): string {
  const base = firstChildNamed(element, "e");
  const sub = firstChildNamed(element, "sub");
  return `<msub>${convertContainer(base)}${convertContainer(sub)}</msub>`;
}

function convertSubSuperscript(element: Element): string {
  const base = firstChildNamed(element, "e");
  const sub = firstChildNamed(element, "sub");
  const sup = firstChildNamed(element, "sup");
  return `<msubsup>${convertContainer(base)}${convertContainer(sub)}${convertContainer(sup)}</msubsup>`;
}

function convertRadical(element: Element): string {
  const degree = firstChildNamed(element, "deg");
  const radicand = firstChildNamed(element, "e");
  const hasDegree = degree !== undefined && flattenText(degree).trim().length > 0;
  return hasDegree
    ? `<mroot>${convertContainer(radicand)}${convertContainer(degree)}</mroot>`
    : `<msqrt>${convertContainer(radicand)}</msqrt>`;
}

const delimiterDefaults: Record<string, string> = { "": "(" };

function convertDelimiter(element: Element): string {
  const props = firstChildNamed(element, "dPr");
  const open = props !== undefined ? firstChildNamed(props, "begChr")?.getAttribute("m:val") : undefined;
  const close = props !== undefined ? firstChildNamed(props, "endChr")?.getAttribute("m:val") : undefined;
  const inner = childrenNamed(element, "e").map((entry) => convertContainer(entry));
  const openChar = open ?? delimiterDefaults[""];
  const closeChar = close ?? ")";
  return `<mrow><mo>${escapeXml(openChar)}</mo>${inner.join(`<mo>,</mo>`)}<mo>${escapeXml(closeChar)}</mo></mrow>`;
}

function convertNary(element: Element): string {
  const props = firstChildNamed(element, "naryPr");
  const chr = props !== undefined ? firstChildNamed(props, "chr")?.getAttribute("m:val") : undefined;
  const sub = firstChildNamed(element, "sub");
  const sup = firstChildNamed(element, "sup");
  const body = firstChildNamed(element, "e");
  const operator = `<mo>${escapeXml(chr ?? "∑")}</mo>`;
  const hasSub = sub !== undefined && flattenText(sub).length > 0;
  const hasSup = sup !== undefined && flattenText(sup).length > 0;
  let operatorWithLimits = operator;
  if (hasSub && hasSup) operatorWithLimits = `<munderover>${operator}${convertContainer(sub)}${convertContainer(sup)}</munderover>`;
  else if (hasSub) operatorWithLimits = `<munder>${operator}${convertContainer(sub)}</munder>`;
  else if (hasSup) operatorWithLimits = `<mover>${operator}${convertContainer(sup)}</mover>`;
  return `<mrow>${operatorWithLimits}${convertContainer(body)}</mrow>`;
}

function convertLimit(element: Element, kind: "low" | "upp"): string {
  const base = firstChildNamed(element, "e");
  const lim = firstChildNamed(element, "lim");
  const tag = kind === "low" ? "munder" : "mover";
  return `<${tag}>${convertContainer(base)}${convertContainer(lim)}</${tag}>`;
}

function convertNode(element: Element): string {
  switch (element.localName) {
    case "r":
      return convertRun(element);
    case "f":
      return convertFraction(element);
    case "sSup":
      return convertSuperscript(element);
    case "sSub":
      return convertSubscript(element);
    case "sSubSup":
      return convertSubSuperscript(element);
    case "rad":
      return convertRadical(element);
    case "d":
      return convertDelimiter(element);
    case "nary":
      return convertNary(element);
    case "limLow":
      return convertLimit(element, "low");
    case "limUpp":
      return convertLimit(element, "upp");
    case "oMath":
    case "oMathPara":
      return convertContainer(element);
    case "rPr":
    case "fPr":
    case "sSupPr":
    case "sSubPr":
    case "sSubSupPr":
    case "radPr":
    case "dPr":
    case "naryPr":
    case "ctrlPr":
      return ""; // formatting/property nodes, not content
    default:
      return fallback(element);
  }
}

/** Converts one <m:oMath> (or <m:oMathPara>) element into a standalone MathML string. */
export function convertOmmlToMathml(omathElement: Element): string {
  const inner = convertContainer(omathElement);
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${inner}</math>`;
}

/** Plain-text approximation of an equation, for contexts that can't render MathML. */
export function linearizeOmml(omathElement: Element): string {
  return flattenText(omathElement).trim();
}
