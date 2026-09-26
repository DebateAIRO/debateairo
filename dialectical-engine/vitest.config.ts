import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: [
    { find: "server-only", replacement: resolve(import.meta.dirname, "tests/render/stubs/server-only.ts") },
    {
      find: /^(?:@\/|(?:\.\.\/)+)lib\/i18n\/I18nProvider$/,
      replacement: resolve(import.meta.dirname, "tests/render/stubs/i18n-provider.tsx")
    },
    { find: "next/headers", replacement: resolve(import.meta.dirname, "tests/render/stubs/next-headers.ts") },
    { find: "next/navigation", replacement: resolve(import.meta.dirname, "tests/render/stubs/next-navigation.ts") },
    { find: "@", replacement: resolve(import.meta.dirname, "apps/ui") },
    { find: "react", replacement: resolve(import.meta.dirname, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(import.meta.dirname, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "acceptance/**/*.test.ts"
    ],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 120_000,
    reporters: ["verbose"]
  }
});
