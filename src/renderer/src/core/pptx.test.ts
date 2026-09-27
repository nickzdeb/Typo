import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parsePptx } from "./pptx";

// A well-known minimal valid 1x1 transparent PNG, used only to prove the
// image-extraction path resolves relationships and reads real bytes.
const tinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const namespaces =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';

async function buildFixture(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${namespaces}>
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Slide title text</a:t></a:r></a:p>
          <a:p><a:r><a:t>Second bullet line</a:t></a:r></a:p>
          <a:p><m:oMathPara><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></m:oMathPara></a:p>
        </p:txBody>
      </p:sp>
      <p:pic>
        <p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
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

describe("parsePptx", () => {
  it("extracts slide text, images, and equations as separate channels", async () => {
    const [slide] = await parsePptx(await buildFixture());

    expect(slide.text).toBe("Slide title text\nSecond bullet line");

    expect(slide.images).toHaveLength(1);
    expect(slide.images[0]).toMatch(/^data:image\/png;base64,/);

    expect(slide.equations).toHaveLength(1);
    expect(slide.equations[0].text).toBe("x");
    expect(slide.equations[0].mathml).toContain("<mi>x</mi>");
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
    const slides = await parsePptx(bytes);
    expect(slides.map((slide) => slide.text)).toEqual(["slide 1", "slide 2", "slide 10"]);
  });
});
