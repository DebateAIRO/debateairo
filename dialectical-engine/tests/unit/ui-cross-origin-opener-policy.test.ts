// NV-05: every response the UI serves through Next carries Cross-Origin-Opener-Policy: same-origin, whatever edge is
// in front of it, so a cross-origin opener of /sign-up (or any other app document) keeps no handle on it and cannot
// count its frames to learn the age-refusal bit.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

const UI_ROOT = resolve(process.cwd(), "apps/ui");
const COOP = { key: "Cross-Origin-Opener-Policy", value: "same-origin" };

async function loadHeaderRules(): Promise<HeaderRule[]> {
  // @ts-expect-error -- next.config.mjs has no declaration file
  const config = (await import("../../apps/ui/next.config.mjs")).default as { headers(): Promise<HeaderRule[]> };
  return config.headers();
}

/** Every .ts, .tsx and .mjs source under `directory`, without dependencies, legal texts or tests. */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || path === join(UI_ROOT, "lib/legal") ? [] : sources(path);
    }
    if (!/\.(?:ts|tsx|mjs)$/u.test(entry.name) || /\.(?:test|source-test)\./u.test(entry.name)) return [];
    return [path];
  });
}

describe("the UI's own Cross-Origin-Opener-Policy (NV-05)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("RELEASE_KEY", "");
    // A named revision, so loading the config never reads git.
    vi.stubEnv("DEBATEAI_SOURCE_REVISION", "e".repeat(40));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("every app response carries COOP same-origin, from one rule only", async () => {
    const routes = await loadHeaderRules();
    const site = routes.find((route) => route.source === "/:path*");
    expect(site).toBeDefined();
    expect(site!.headers).toContainEqual(COOP);
    // Two values would fail structured-header parsing and fall back to unsafe-none.
    const everyCoop = routes.flatMap((route) => route.headers.filter(({ key }) => key.toLowerCase() === "cross-origin-opener-policy"));
    expect(everyCoop).toEqual([COOP]);
  });

  it("no app code relies on an opener relationship that COOP severs", () => {
    const files = ["app", "components", "lib"].flatMap((directory) => sources(join(UI_ROOT, directory)));
    files.push(join(UI_ROOT, "middleware.ts"));
    expect(files.length).toBeGreaterThan(100);
    const relying = files.filter((file) => {
      const text = readFileSync(file, "utf8");
      return /\b(?:window|globalThis)\.open\s*\(/u.test(text) || /\.opener\b/u.test(text);
    });
    expect(relying).toEqual([]);
  });

  it("the VPS edge agrees, and replaces the app's value rather than adding a second one", () => {
    const caddyfile = readFileSync(resolve(process.cwd(), "deploy/vps/Caddyfile"), "utf8");
    const site = caddyfile.indexOf("{$DEBATEAI_PUBLIC_HOSTNAME} {");
    expect(site).toBeGreaterThanOrEqual(0);
    const block = /\n\theader \{\n([\s\S]*?)\n\t\}/u.exec(caddyfile.slice(site));
    expect(block).not.toBeNull();
    const lines = block![1]!.split("\n").map((line) => line.trim());
    expect(lines).toContain('Cross-Origin-Opener-Policy "same-origin"');
    // A deletion (or an explicit defer) makes Caddy write the block when the response leaves, over the upstream's value.
    expect(lines.includes("-Server") || lines.includes("defer")).toBe(true);
  });
});
