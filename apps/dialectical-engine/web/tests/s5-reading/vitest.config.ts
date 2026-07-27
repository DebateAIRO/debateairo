import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const webRoot = resolve(__dirname, "../..");

export default defineConfig({
  root: webRoot,
  oxc: {
    jsx: {
      runtime: "automatic"
    }
  },
  resolve: {
    alias: {
      "@": webRoot
    }
  },
  test: {
    environment: "jsdom",
    include: ["tests/s5-reading/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
    restoreMocks: true
  }
});
