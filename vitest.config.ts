import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // happy-dom, not "node": extract.ts's HTML path needs a real DOMParser.
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "reference", "out", "release"],
  },
});
