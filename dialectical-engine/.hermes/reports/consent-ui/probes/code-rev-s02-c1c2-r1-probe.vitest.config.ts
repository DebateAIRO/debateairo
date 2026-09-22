// CODE-REV-S02-C1C2 r1 — reviewer's own vitest config, so probe files live entirely inside
// .review-scratch/ (this seat's allowed scratch) and never inside the repo's tests/ tree.
// Aliases copied from the repo's vitest.config.ts so the probes load the same React.
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
const ROOT = resolve(import.meta.dirname, "..");
export default defineConfig({
  resolve: { alias: [
    { find: "react", replacement: resolve(ROOT, "apps/ui/node_modules/react") },
    { find: "react-dom", replacement: resolve(ROOT, "apps/ui/node_modules/react-dom") }
  ] },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    root: ROOT,
    include: [".review-scratch/**/*.probe.tsx", ".review-scratch/**/*.probe.ts"],
    fileParallelism: false,
    reporters: ["verbose"]
  }
});
