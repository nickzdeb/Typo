import { createSignal } from "solid-js";
import type { LocalDocument } from "./types";

export const [getActiveDocument, setActiveDocument] =
  createSignal<LocalDocument | null>(null);
