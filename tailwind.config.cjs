/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#101216",
        panel: "#191d24",
        panelMuted: "#222832",
        ink: "#f1f3f5",
        muted: "#a7b0bd",
        accent: "#8ab4ff",
        success: "#8bd5a3",
        error: "#ff9b9b",
      },
    },
  },
  plugins: [],
};
