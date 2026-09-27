import { For, Show, createEffect, createSignal, onCleanup } from "solid-js";
import { cn } from "../lib/cn";
import {
  applyTheme,
  colorsForState,
  loadThemeState,
  presets,
  saveThemeState,
  type CustomBase,
  type ThemeState,
} from "../core/theme";

const customFields: { key: keyof CustomBase; label: string }[] = [
  { key: "canvas", label: "Background" },
  { key: "panel", label: "Panels" },
  { key: "ink", label: "Text" },
  { key: "accent", label: "Accent" },
];

export function ThemeSettings() {
  let containerRef: HTMLDivElement | undefined;
  const [open, setOpen] = createSignal(false);
  const [state, setState] = createSignal<ThemeState>(loadThemeState());

  function commit(next: ThemeState): void {
    setState(next);
    saveThemeState(next);
    applyTheme(colorsForState(next));
  }

  function selectPreset(id: string): void {
    commit({ ...state(), presetId: id });
  }

  function updateCustom(key: keyof CustomBase, value: string): void {
    commit({ presetId: "custom", custom: { ...state().custom, [key]: value } });
  }

  createEffect(() => {
    if (!open()) return;
    const closeIfOutside = (event: PointerEvent): void => {
      if (containerRef !== undefined && !containerRef.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    onCleanup(() => document.removeEventListener("pointerdown", closeIfOutside));
  });

  return (
    <div class="relative" ref={containerRef}>
      <button
        class="rounded-lg px-3 py-2 text-sm text-muted hover:bg-panelMuted"
        onClick={() => setOpen(!open())}
        aria-label="Theme settings"
      >
        Theme
      </button>
      <Show when={open()}>
        <div class="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-panelMuted bg-panel p-4 shadow-2xl">
          <p class="mb-3 text-xs uppercase tracking-wide text-muted">Theme</p>
          <div class="mb-4 grid grid-cols-2 gap-2">
            <For each={presets}>
              {(preset) => (
                <button
                  class={cn(
                    "flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs text-ink",
                    state().presetId === preset.id ? "border-accent" : "border-transparent hover:bg-panelMuted",
                  )}
                  onClick={() => selectPreset(preset.id)}
                >
                  <span class="h-4 w-4 shrink-0 rounded-full border border-panelMuted" style={{ background: preset.colors.canvas }} />
                  {preset.name}
                </button>
              )}
            </For>
            <button
              class={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-xs text-ink",
                state().presetId === "custom" ? "border-accent" : "border-transparent hover:bg-panelMuted",
              )}
              onClick={() => selectPreset("custom")}
            >
              <span class="h-4 w-4 shrink-0 rounded-full border border-panelMuted" style={{ background: state().custom.accent }} />
              Custom
            </button>
          </div>
          <Show when={state().presetId === "custom"}>
            <div class="grid grid-cols-2 gap-3">
              <For each={customFields}>
                {(field) => (
                  <label class="flex flex-col gap-1 text-xs text-muted">
                    {field.label}
                    <input
                      type="color"
                      class="h-8 w-full cursor-pointer rounded border border-panelMuted bg-transparent"
                      value={state().custom[field.key]}
                      onInput={(event) => updateCustom(field.key, event.currentTarget.value)}
                    />
                  </label>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
