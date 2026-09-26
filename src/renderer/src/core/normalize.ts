const keyboardNames: Record<string, string> = {
  Α: "alpha", α: "alpha", Β: "beta", β: "beta", Γ: "gamma", γ: "gamma",
  Δ: "delta", δ: "delta", Ε: "epsilon", ε: "epsilon", ϵ: "epsilon",
  Ζ: "zeta", ζ: "zeta", Η: "eta", η: "eta", Θ: "theta", θ: "theta", ϑ: "theta",
  Ι: "iota", ι: "iota", Κ: "kappa", κ: "kappa", Λ: "lambda", λ: "lambda",
  Μ: "mu", μ: "mu", Ν: "nu", ν: "nu", Ξ: "xi", ξ: "xi", Ο: "omicron", ο: "omicron",
  Π: "pi", π: "pi", Ρ: "rho", ρ: "rho", ϱ: "rho", Σ: "sigma", σ: "sigma", ς: "sigma",
  Τ: "tau", τ: "tau", Υ: "upsilon", υ: "upsilon", Φ: "phi", φ: "phi", ϕ: "phi",
  Χ: "chi", χ: "chi", Ψ: "psi", ψ: "psi", Ω: "omega", ω: "omega",
  "×": "times", "÷": "divided by", "±": "plus or minus", "∞": "infinity",
  "≤": "less than or equal to", "≥": "greater than or equal to", "∑": "sum", "∫": "integral",
  "√": "square root", "→": "right arrow", "←": "left arrow", "≈": "approximately",
};

function replaceKeyboardSymbols(text: string): string {
  return Array.from(text, (character) => {
    const replacement = keyboardNames[character];
    return replacement === undefined ? character : " " + replacement + " ";
  }).join("");
}

export function normalizeDocumentText(text: string): string {
  return replaceKeyboardSymbols(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u200b]/g, " ")
    .replace(/[\t ]+/g, " ")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function wordCount(text: string): number {
  return normalizeDocumentText(text).split(/\s+/).filter(Boolean).length;
}
