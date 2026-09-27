import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { cn } from "../lib/cn";

type KeySpec = { code: string; label: string; flex?: number };

// Laid out by KeyboardEvent.code (physical key position), not .key, so the
// lit-up key matches where a finger actually is regardless of Shift/layout.
const rows: KeySpec[][] = [
  [
    { code: "Digit1", label: "1" }, { code: "Digit2", label: "2" }, { code: "Digit3", label: "3" },
    { code: "Digit4", label: "4" }, { code: "Digit5", label: "5" }, { code: "Digit6", label: "6" },
    { code: "Digit7", label: "7" }, { code: "Digit8", label: "8" }, { code: "Digit9", label: "9" },
    { code: "Digit0", label: "0" },
  ],
  [
    { code: "KeyQ", label: "Q" }, { code: "KeyW", label: "W" }, { code: "KeyE", label: "E" },
    { code: "KeyR", label: "R" }, { code: "KeyT", label: "T" }, { code: "KeyY", label: "Y" },
    { code: "KeyU", label: "U" }, { code: "KeyI", label: "I" }, { code: "KeyO", label: "O" },
    { code: "KeyP", label: "P" },
  ],
  [
    { code: "KeyA", label: "A" }, { code: "KeyS", label: "S" }, { code: "KeyD", label: "D" },
    { code: "KeyF", label: "F" }, { code: "KeyG", label: "G" }, { code: "KeyH", label: "H" },
    { code: "KeyJ", label: "J" }, { code: "KeyK", label: "K" }, { code: "KeyL", label: "L" },
  ],
  [
    { code: "ShiftLeft", label: "shift", flex: 2.2 },
    { code: "KeyZ", label: "Z" }, { code: "KeyX", label: "X" }, { code: "KeyC", label: "C" },
    { code: "KeyV", label: "V" }, { code: "KeyB", label: "B" }, { code: "KeyN", label: "N" },
    { code: "KeyM", label: "M" },
    { code: "ShiftRight", label: "shift", flex: 2.2 },
  ],
  [{ code: "Space", label: "space", flex: 8 }],
];

const storageKey = "typo.keyboardCollapsed";

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

function saveCollapsed(value: boolean): void {
  try {
    localStorage.setItem(storageKey, String(value));
  } catch {
    // Storage may be unavailable; the preference just won't persist across launches.
  }
}

export function VirtualKeyboard() {
  const [pressed, setPressed] = createSignal<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = createSignal(loadCollapsed());

  onMount(() => {
    const onDown = (event: KeyboardEvent): void => {
      if (pressed().has(event.code)) return;
      setPressed((current) => new Set(current).add(event.code));
    };
    const onUp = (event: KeyboardEvent): void => {
      setPressed((current) => {
        if (!current.has(event.code)) return current;
        const next = new Set(current);
        next.delete(event.code);
        return next;
      });
    };
    const onBlurWindow = (): void => {
      setPressed(new Set<string>());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlurWindow);
    onCleanup(() => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlurWindow);
    });
  });

  function toggle(): void {
    const next = !collapsed();
    setCollapsed(next);
    saveCollapsed(next);
  }

  return (
    <div class="mt-4 border-t border-panelMuted pt-4">
      <div class="mb-2 flex items-center justify-between">
        <p class="text-xs uppercase tracking-wide text-muted">keyboard</p>
        <button class="text-xs text-muted hover:text-ink" onClick={toggle}>
          {collapsed() ? "Show" : "Hide"}
        </button>
      </div>
      <Show when={!collapsed()}>
        <div class="space-y-1">
          <For each={rows}>
            {(row) => (
              <div class="flex gap-1">
                <For each={row}>
                  {(key) => (
                    <div
                      class={cn(
                        "flex items-center justify-center rounded border py-1.5 text-[10px] uppercase transition",
                        pressed().has(key.code)
                          ? "border-accent bg-accent text-canvas"
                          : "border-panelMuted bg-canvas text-muted",
                      )}
                      style={{ flex: key.flex ?? 1 }}
                    >
                      {key.label}
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
