import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom, not "node" or "happy-dom": extract.ts's HTML path needs a real DOMParser, and
    // the pptx/OMML parsing needs correct namespace-aware DOM APIs (getElementsByTagNameNS),
    // which happy-dom does not implement correctly for XML documents.
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "reference", "out", "release"],
  },
});
