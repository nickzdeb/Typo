export type ThemeColors = {
  canvas: string;
  panel: string;
  panelMuted: string;
  ink: string;
  muted: string;
  accent: string;
  success: string;
  error: string;
};

export type CustomBase = {
  canvas: string;
  panel: string;
  ink: string;
  accent: string;
};

export type ThemePreset = {
  id: string;
  name: string;
  colors: ThemeColors;
};

export type ThemeState = {
  presetId: string;
  custom: CustomBase;
};

export const presets: ThemePreset[] = [
  {
    id: "midnight",
    name: "Midnight",
    colors: {
      canvas: "#101216", panel: "#191d24", panelMuted: "#222832", ink: "#f1f3f5",
      muted: "#a7b0bd", accent: "#8ab4ff", success: "#8bd5a3", error: "#ff9b9b",
    },
  },
  {
    id: "daylight",
    name: "Daylight",
    colors: {
      canvas: "#f6f7f9", panel: "#ffffff", panelMuted: "#e9ecf1", ink: "#1c2128",
      muted: "#5b6472", accent: "#2f6fed", success: "#1f9d55", error: "#d1342f",
    },
  },
  {
    id: "dusk",
    name: "Dusk",
    colors: {
      canvas: "#161320", panel: "#211c30", panelMuted: "#2c2540", ink: "#f3eefc",
      muted: "#b0a4cf", accent: "#c792ea", success: "#7ee8b0", error: "#ff8fae",
    },
  },
  {
    id: "paper",
    name: "Paper",
    colors: {
      canvas: "#f2ecdf", panel: "#fbf7ee", panelMuted: "#e9dfc9", ink: "#2b2013",
      muted: "#7a6a52", accent: "#a1662f", success: "#3f7d3f", error: "#a3331f",
    },
  },
];

export const defaultCustom: CustomBase = {
  canvas: "#101216", panel: "#191d24", ink: "#f1f3f5", accent: "#8ab4ff",
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const expanded = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(expanded, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("");
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.5;
}

export function buildCustomColors(base: CustomBase): ThemeColors {
  const dark = isDark(base.canvas);
  return {
    canvas: base.canvas,
    panel: base.panel,
    ink: base.ink,
    accent: base.accent,
    panelMuted: mix(base.panel, base.ink, 0.14),
    muted: mix(base.ink, base.canvas, 0.45),
    success: dark ? "#8bd5a3" : "#1f9d55",
    error: dark ? "#ff9b9b" : "#d1342f",
  };
}

export function colorsForState(state: ThemeState): ThemeColors {
  if (state.presetId === "custom") return buildCustomColors(state.custom);
  return presets.find((preset) => preset.id === state.presetId)?.colors ?? presets[0].colors;
}

const cssVariableByKey: Record<keyof ThemeColors, string> = {
  canvas: "--color-canvas", panel: "--color-panel", panelMuted: "--color-panel-muted", ink: "--color-ink",
  muted: "--color-muted", accent: "--color-accent", success: "--color-success", error: "--color-error",
};

export function applyTheme(colors: ThemeColors): void {
  const root = document.documentElement;
  for (const key of Object.keys(cssVariableByKey) as (keyof ThemeColors)[]) {
    root.style.setProperty(cssVariableByKey[key], colors[key]);
  }
  root.style.colorScheme = isDark(colors.canvas) ? "dark" : "light";
}

const storageKey = "documentTrainer.theme";

export function loadThemeState(): ThemeState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return { presetId: presets[0].id, custom: defaultCustom };
    const parsed = JSON.parse(raw) as Partial<ThemeState> | null;
    return {
      presetId: typeof parsed?.presetId === "string" ? parsed.presetId : presets[0].id,
      custom: { ...defaultCustom, ...(parsed?.custom ?? {}) },
    };
  } catch {
    return { presetId: presets[0].id, custom: defaultCustom };
  }
}

export function saveThemeState(state: ThemeState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (e.g. disabled by the user); the theme still applies for this session.
  }
}

export function initTheme(): ThemeState {
  const state = loadThemeState();
  applyTheme(colorsForState(state));
  return state;
}
