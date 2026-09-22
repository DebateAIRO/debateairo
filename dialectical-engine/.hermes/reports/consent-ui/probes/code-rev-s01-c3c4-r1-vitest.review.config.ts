import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// CODE-REV-S01-C3C4 r1 — the root config with `.review-scratch/**` added to
// `include`, so the reviewer's own probes run without touching `tests/**`.
const root = resolve(import.meta.dirname, "..");

export default defineConfig({
  resolve: {
    alias: [
      { find: "next/headers", replacement: resolve(root, "tests/render/stubs/next-headers.ts") },
      { find: "next/navigation", replacement: resolve(root, "tests/render/stubs/next-navigation.ts") },
      { find: "@", replacement: resolve(root, "apps/ui") },
      { find: "react", replacement: resolve(root, "apps/ui/node_modules/react") },
      { find: "react-dom", replacement: resolve(root, "apps/ui/node_modules/react-dom") }
    ]
  },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    root,
    include: [".review-scratch/**/*.test.tsx", ".review-scratch/**/*.test.ts"],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
