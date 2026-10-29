import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const servicePath = resolve(root, "apps/api/src/publication-review/staff.ts");
const source = () => readFileSync(servicePath, "utf8");

describe("publication review staff boundary", () => {
  it("keeps content lease and cipher primitives out of staff routes and the review service", () => {
    expect(existsSync(servicePath)).toBe(true);
    const directory = resolve(root, "apps/api/src/staff");
    const files = readdirSync(directory).filter((file) => file.endsWith(".ts"));
    for (const file of [...files.map((name) => resolve(directory, name)), servicePath]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\b(?:withRunContentLease|encryptAttestedContentForRun|decryptContentForRun|decryptLeasedContentForRun)\b/u);
    }
  });

  it("passes run ids only from opened or queued review records", () => {
    if (!existsSync(servicePath)) return;
    const remaining = source()
      .replace(/\brunId:\s*(?:opened|item)\.runId\b/gu, "")
      .replace(/\b(?:opened|item)\.runId\b/gu, "")
      .replace(/\brunId\??:\s*string\b/gu, "");
    expect(remaining).not.toMatch(/\brunId\b/u);
  });

  it("writes no operational log from the review service", () => {
    if (!existsSync(servicePath)) return;
    expect(source()).not.toMatch(/\bconsole\.|\blog\s*\(/u);
  });
});
