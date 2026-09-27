import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parsePptx, type SlideShape } from "./pptx";

// A well-known minimal valid 1x1 transparent PNG, used only to prove the
// image-extraction path resolves relationships and reads real bytes.
const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const namespaces =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

// Slide is the default 12192000 x 6858000 EMU (16:9) since no presentation.xml is given.
async function buildFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${namespaces}>
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:xfrm><a:off x="914400" y="914400"/><a:ext cx="4572000" cy="1143000"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:p><a:r><a:rPr sz="4400"/><a:t>Slide title text</a:t></a:r></a:p>
          <a:p><a:r><a:t>Second bullet line</a:t></a:r></a:p>
          <a:p><m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara></a:p>
        </p:txBody>
      </p:sp>
      <p:pic>
        <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
        <p:spPr>
          <a:xfrm><a:off x="1828800" y="3657600"/><a:ext cx="2286000" cy="1714500"/></a:xfrm>
        </p:spPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`,
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/>
</Relationships>`,
  );
  zip.file("ppt/media/image1.png", Buffer.from(tinyPngBase64, "base64"));
  return new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
}

function isTextbox(shape: SlideShape): shape is Extract<SlideShape, { kind: "textbox" }> {
  return shape.kind === "textbox";
}

function isImage(shape: SlideShape): shape is Extract<SlideShape, { kind: "image" }> {
  return shape.kind === "image";
}

describe("parsePptx", () => {
  it("uses the default 16:9 slide size when presentation.xml is absent", async () => {
    const { slideWidthEmu, slideHeightEmu } = await parsePptx(await buildFixture());
    expect(slideWidthEmu).toBe(12192000);
    expect(slideHeightEmu).toBe(6858000);
  });

  it("positions a textbox shape at its actual percentage-of-slide location", async () => {
    const { slides } = await parsePptx(await buildFixture());
    const textbox = slides[0].shapes.find(isTextbox)!;
    expect(textbox.left).toBeCloseTo(7.5, 1);
    expect(textbox.top).toBeCloseTo(13.33, 1);
    expect(textbox.width).toBeCloseTo(37.5, 1);
    expect(textbox.height).toBeCloseTo(16.67, 1);
  });

  it("puts slide text and an embedded equation in the same textbox as separate blocks", async () => {
    const { slides } = await parsePptx(await buildFixture());
    const textbox = slides[0].shapes.find(isTextbox)!;
    expect(textbox.blocks).toEqual([
      { kind: "text", text: "Slide title text\nSecond bullet line" },
      { kind: "equation", mathml: expect.stringContaining("<mi>x</mi>"), text: "x" },
    ]);
    // The equation's raw content never leaks into the slide's aggregated typable text.
    expect(slides[0].text).toBe("Slide title text\nSecond bullet line");
  });

  it("computes a font size in cqw from the run's sz attribute", async () => {
    const { slides } = await parsePptx(await buildFixture());
    const textbox = slides[0].shapes.find(isTextbox)!;
    // 44pt = 4400 (hundredths of a point) * 12700 (EMU/pt) / 12192000 (slide width EMU) * 100
    expect(textbox.fontSizeCqw).toBeCloseTo((4400 / 100) * 12700 / 12192000 * 100, 3);
  });

  it("resolves an image's relationship and position, and reads its real bytes", async () => {
    const { slides } = await parsePptx(await buildFixture());
    const image = slides[0].shapes.find(isImage)!;
    expect(image.src).toMatch(/^data:image\/png;base64,/);
    expect(image.left).toBeCloseTo(15, 1);
    expect(image.top).toBeCloseTo(53.33, 1);
  });

  it("orders slides numerically, not lexicographically (slide2 before slide10)", async () => {
    const zip = new JSZip();
    for (const n of [1, 2, 10]) {
      zip.file(
        `ppt/slides/slide${n}.xml`,
        `<?xml version="1.0"?><p:sld ${namespaces}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>slide ${n}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
      );
    }
    const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
    const { slides } = await parsePptx(bytes);
    expect(slides.map((slide) => slide.text)).toEqual(["slide 1", "slide 2", "slide 10"]);
  });

  it("falls back to a plausible title position when a title placeholder has no explicit xfrm", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<?xml version="1.0"?>
<p:sld ${namespaces}>
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
        <p:spPr/>
        <p:txBody><a:p><a:r><a:t>Untitled position</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`,
    );
    const bytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
    const { slides } = await parsePptx(bytes);
    const textbox = slides[0].shapes.find(isTextbox)!;
    expect(textbox.top).toBeLessThan(10); // title fallback sits near the top
    expect(textbox.width).toBeGreaterThan(50); // and spans most of the slide's width
  });
});
