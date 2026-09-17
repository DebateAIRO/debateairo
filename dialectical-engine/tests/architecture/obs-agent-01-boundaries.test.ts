import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

async function filesBelow(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return nested.flat().sort();
}

describe("OBS-01 architecture boundaries", () => {
  it("keeps all agent environment reads in the register loader", async () => {
    const root = resolve("apps/observation-agent");
    const sources = (await filesBelow(root)).filter((path) => [".ts", ".js", ".mjs"].includes(extname(path)));
    expect(sources.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const path of sources) {
      if ((await readFile(path, "utf8")).includes(["process", "env"].join("."))) {
        violations.push(relative(process.cwd(), path));
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not import product runtimes or the excluded security zone", async () => {
    const root = resolve("apps/observation-agent");
    const forbidden = [
      "apps/api", "apps/runner", "apps/ui", "packages/obs-capture", "packages/crypto",
      "packages/db/src/identity", "apps/api/src/mail-channel", "apps/api/src/mfa",
      "apps/api/src/registration", "migrations/0030_identity_foundation",
      "migrations/0031_registration_verification", "migrations/0032_registration_audit_erasure_checks",
      "migrations/0033_verification_token_credentials"
    ];
    const violations: string[] = [];
    for (const path of (await filesBelow(root)).filter((entry) => extname(entry) === ".ts")) {
      const source = await readFile(path, "utf8");
      for (const specifier of source.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/gu)) {
        if (forbidden.some((prefix) => specifier[1]!.includes(prefix))) {
          violations.push(`${relative(process.cwd(), path)}:${specifier[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
