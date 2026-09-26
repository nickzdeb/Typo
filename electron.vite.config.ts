import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: "electron/main.ts" } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { lib: { entry: "electron/preload.ts" }, rollupOptions: { output: { format: "cjs" } } } },
  renderer: { plugins: [solid()] },
});
