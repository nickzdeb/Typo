import { describe, expect, it } from "vitest";
import { convertOmmlToMathml, linearizeOmml } from "./omml";

function parseOMath(inner: string): Element {
  const xml = `<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${inner}</m:oMath>`;
  return new DOMParser().parseFromString(xml, "application/xml").documentElement;
}

describe("convertOmmlToMathml", () => {
  it("wraps content in a MathML root", () => {
    const mathml = convertOmmlToMathml(parseOMath("<m:r><m:t>x</m:t></m:r>"));
    expect(mathml).toMatch(/^<math xmlns="http:\/\/www\.w3\.org\/1998\/Math\/MathML"/);
    expect(mathml).toContain("<mi>x</mi>");
  });

  it("classifies runs as number, operator, or identifier", () => {
    expect(convertOmmlToMathml(parseOMath("<m:r><m:t>42</m:t></m:r>"))).toContain("<mn>42</mn>");
    expect(convertOmmlToMathml(parseOMath("<m:r><m:t>+</m:t></m:r>"))).toContain("<mo>+</mo>");
    expect(convertOmmlToMathml(parseOMath("<m:r><m:t>y</m:t></m:r>"))).toContain("<mi>y</mi>");
  });

  it("converts a fraction", () => {
    const mathml = convertOmmlToMathml(
      parseOMath("<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>"),
    );
    expect(mathml).toContain("<mfrac><mn>1</mn><mn>2</mn></mfrac>");
  });

  it("converts superscript and subscript", () => {
    const sup = convertOmmlToMathml(
      parseOMath("<m:sSup><m:e><m:r><m:t>x</m:t></m:r></m:e><m:sup><m:r><m:t>2</m:t></m:r></m:sup></m:sSup>"),
    );
    expect(sup).toContain("<msup><mi>x</mi><mn>2</mn></msup>");

    const sub = convertOmmlToMathml(
      parseOMath("<m:sSub><m:e><m:r><m:t>a</m:t></m:r></m:e><m:sub><m:r><m:t>i</m:t></m:r></m:sub></m:sSub>"),
    );
    expect(sub).toContain("<msub><mi>a</mi><mi>i</mi></msub>");
  });

  it("converts a square root (no degree) and an nth root (with degree)", () => {
    const sqrt = convertOmmlToMathml(parseOMath("<m:rad><m:deg/><m:e><m:r><m:t>4</m:t></m:r></m:e></m:rad>"));
    expect(sqrt).toContain("<msqrt><mn>4</mn></msqrt>");

    const cubeRoot = convertOmmlToMathml(
      parseOMath("<m:rad><m:deg><m:r><m:t>3</m:t></m:r></m:deg><m:e><m:r><m:t>8</m:t></m:r></m:e></m:rad>"),
    );
    expect(cubeRoot).toContain("<mroot><mn>8</mn><mn>3</mn></mroot>");
  });

  it("converts a parenthesized delimiter", () => {
    const mathml = convertOmmlToMathml(parseOMath("<m:d><m:e><m:r><m:t>x</m:t></m:r></m:e></m:d>"));
    expect(mathml).toContain("<mo>(</mo>");
    expect(mathml).toContain("<mo>)</mo>");
    expect(mathml).toContain("<mi>x</mi>");
  });

  it("converts an n-ary sum with limits to munderover", () => {
    const mathml = convertOmmlToMathml(
      parseOMath(
        '<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub><m:r><m:t>i=1</m:t></m:r></m:sub><m:sup><m:r><m:t>n</m:t></m:r></m:sup><m:e><m:r><m:t>i</m:t></m:r></m:e></m:nary>',
      ),
    );
    expect(mathml).toContain("<munderover>");
    expect(mathml).toContain("∑");
    expect(mathml).toContain("i=1");
    expect(mathml).toContain("<mi>n</mi>");
  });

  it("falls back to flattened text for unsupported constructs instead of breaking", () => {
    const mathml = convertOmmlToMathml(parseOMath("<m:bar><m:e><m:r><m:t>xyz</m:t></m:r></m:e></m:bar>"));
    expect(mathml).toContain("<mtext>xyz</mtext>");
  });
});

describe("linearizeOmml", () => {
  it("flattens an equation to plain text", () => {
    const text = linearizeOmml(
      parseOMath("<m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f>"),
    );
    expect(text).toBe("12");
  });
});
