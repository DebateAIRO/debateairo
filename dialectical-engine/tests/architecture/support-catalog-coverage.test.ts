import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  SUPPORT_CAPABILITIES,
  SUPPORT_PAGE_ROUTES,
  SUPPORT_PROXY_ROUTES,
} from "../../packages/support-kb/src/catalog.js";

function discoverPageRoutes(directory: string, root = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverPageRoutes(path, root);
    if (!entry.isFile() || entry.name !== "page.tsx") return [];
    const parent = relative(root, directory).split(sep).filter(Boolean).join("/");
    return [parent === "" ? "/" : `/${parent}`];
  });
}

describe("Support catalog route coverage", () => {
  it("accounts for every current page pathname by name", () => {
    // Property: adding or removing a route fails with the exact unmapped pathname, not merely a count mismatch.
    const appDirectory = fileURLToPath(new URL("../../apps/ui/app/", import.meta.url));
    const discovered = discoverPageRoutes(appDirectory).sort();

    expect([...SUPPORT_PAGE_ROUTES].sort()).toEqual(discovered);
    expect(SUPPORT_PAGE_ROUTES).toEqual([
      "/",
      "/admin/workers",
      "/debate/[id]",
      "/enroll-mfa",
      "/help",
      "/login",
      "/new",
      "/public/debate/[id]",
      "/settings",
      "/sign-up",
      "/verify-email",
    ]);
  });

  it("marks sensitive stateful pages as excluded from ordinary actions", () => {
    // Property: known routes do not automatically become model-selectable navigation.
    const disposition = new Map(SUPPORT_CAPABILITIES.map(({ route, disposition }) => [route, disposition]));

    expect(disposition.get("/verify-email")).toBe("excluded");
    expect(disposition.get("/enroll-mfa")).toBe("excluded");
    expect(disposition.get("/admin/workers")).toBe("excluded");
    expect(disposition.get("/debate/[id]")).toBe("trusted-context-only");
    expect(disposition.get("/public/debate/[id]")).toBe("trusted-context-only");
    expect(SUPPORT_PROXY_ROUTES).toEqual(["/api/[...path]"]);
  });

  it("maps every capability article id to a complete bilingual pair", () => {
    // Property: catalog additions cannot name knowledge that is absent in one visitor language.
    const contentDirectory = fileURLToPath(new URL("../../packages/support-kb/content/", import.meta.url));
    const filenames = new Set(readdirSync(contentDirectory));

    for (const capability of SUPPORT_CAPABILITIES) {
      expect(capability.articleIds.length, capability.id).toBeGreaterThan(0);
      for (const articleId of capability.articleIds) {
        expect(filenames.has(`${articleId}.en.md`), `${capability.id} -> ${articleId}.en.md`).toBe(true);
        expect(filenames.has(`${articleId}.ro.md`), `${capability.id} -> ${articleId}.ro.md`).toBe(true);
      }
    }
  });

  it("keeps the browser-safe catalog free of Node-only imports and exports it as a subpath", () => {
    // Property: UI consumers can share the authority without bundling filesystem or crypto modules.
    const packageDirectory = fileURLToPath(new URL("../../packages/support-kb/", import.meta.url));
    const catalogSource = readFileSync(join(packageDirectory, "src/catalog.ts"), "utf8");
    const manifest = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")) as {
      exports: Record<string, string>;
    };

    expect(catalogSource).not.toMatch(/from ["']node:/u);
    expect(manifest.exports["./catalog"]).toBe("./src/catalog.ts");
  });
});
