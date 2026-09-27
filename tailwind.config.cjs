/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // rgb(var(--x) / <alpha-value>), not var(--x) directly: Tailwind substitutes
        // <alpha-value> from a /NN opacity modifier (e.g. bg-error/30) only when the
        // variable holds space-separated "R G B" channels in this exact wrapper —
        // see core/theme.ts, which sets the variables that way for this reason.
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        panelMuted: "rgb(var(--color-panel-muted) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        error: "rgb(var(--color-error) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
