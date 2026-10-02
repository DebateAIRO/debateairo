import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const migration = "migrations/0085_registration_region.sql";
const writer = "packages/db/src/identity.ts";

function productionFiles(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "migrations", "apps", "packages"], {
    cwd: root,
    encoding: "utf8"
  }).split("\n").filter((path) => /\.(?:[cm]?js|tsx?|sql)$/.test(path));
}

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("registration region scope", () => {
  it("S1 keeps the region relation in its migration and account creation writer only", () => {
    const references = productionFiles().filter((path) => source(path).includes("registration_region"));
    expect(references.sort()).toEqual([migration, writer]);

    const writerSource = source(writer);
    expect(writerSource).toContain("SELECT identity.record_registration_region($1,$2,$3)");
    expect(writerSource).not.toMatch(/\b(?:FROM|JOIN)\s+identity\.registration_region\b/i);
  });

  it("S2 does not backfill region rows during migration", () => {
    const sql = source(migration).replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sql).not.toMatch(/\bINSERT\s+INTO\b[^;]*\bSELECT\b/i);
  });
});
