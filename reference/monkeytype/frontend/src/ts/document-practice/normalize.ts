import type { LocalDocument } from "./types";

export function normalizeDocumentText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u200b]/g, " ")
    .replace(/[\t ]+/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function documentTextToWords(text: string): string[] {
  const normalized = normalizeDocumentText(text);
  if (normalized.length === 0) return [];

  const lines = normalized.split("\n");
  const words: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? "";
    const lineWords = line.split(" ").filter((word) => word.length > 0);
    const isLastLine = lineIndex === lines.length - 1;

    if (lineWords.length === 0) {
      if (!isLastLine) words.push("\n");
      continue;
    }

    for (let wordIndex = 0; wordIndex < lineWords.length; wordIndex++) {
      const word = lineWords[wordIndex] as string;
      const isLastWord = wordIndex === lineWords.length - 1;
      words.push(!isLastLine && isLastWord ? word + "\n" : word);
    }
  }

  return words;
}

export function fingerprintText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getDocumentWordCount(document: Pick<LocalDocument, "text">): number {
  return documentTextToWords(document.text).length;
}
