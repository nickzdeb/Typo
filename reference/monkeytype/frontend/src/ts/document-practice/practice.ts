import { setConfig } from "../config/setters";
import * as CustomText from "../test/custom-text";
import { setCustomTextIndicator } from "../states/core";
import { navigate } from "../controllers/route-controller";
import { markDocumentPracticed } from "./store";
import { setActiveDocument } from "./state";
import { documentTextToWords } from "./normalize";
import type { LocalDocument } from "./types";

export async function startDocumentPractice(document: LocalDocument): Promise<void> {
  const words = documentTextToWords(document.text);
  if (words.length === 0) throw new Error("This document has no practiceable text");

  CustomText.setText(words);
  CustomText.setMode("repeat");
  CustomText.setLimitMode("word");
  CustomText.setLimitValue(words.length);
  CustomText.setPipeDelimiter(false);
  setConfig("mode", "custom", { nosave: true });
  setCustomTextIndicator({ name: document.title, isLong: false });
  setActiveDocument(document);
  await markDocumentPracticed(document.id);
  await navigate("/", { force: true, data: { documentPractice: true } });
}
