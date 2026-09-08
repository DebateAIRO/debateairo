import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveZoneRouteMountRegion } from "../support/zone-boundary.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const indexGitPath = "dialectical-engine/apps/api/src/index.ts";
const indexPath = fileURLToPath(new URL("../../apps/api/src/index.ts", import.meta.url));
const clientMount = "registerClientReportRoutes(api);";

function requireBaseRef(): string {
  const value = process.env.FIX06_BASE_REF;
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("FIX06_BASE_REF_REQUIRED_FULL_SHA");
  }
  execFileSync("git", ["cat-file", "-e", `${value}^{commit}`], {
    cwd: repositoryRoot,
  });
  return value;
}

function requireRegion(source: string, label: string) {
  const region = resolveZoneRouteMountRegion(source);
  if (!region.ok) throw new Error(`${label}:${region.reason}`);
  return region;
}

describe("FIX-06 zone-region placement", () => {
  it("keeps the admitted region byte-identical and mounts the client route after it", () => {
    const baseRef = requireBaseRef();
    const baseSource = execFileSync(
      "git",
      ["show", `${baseRef}:${indexGitPath}`],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    const workSource = readFileSync(indexPath, "utf8");
    const base = requireRegion(baseSource, "base");
    const work = requireRegion(workSource, "work");
    const mountOffset = workSource.indexOf(clientMount);

    expect(work.region).toBe(base.region);
    expect(work.bytes).toBe(base.bytes);
    expect(work.contentHash).toBe(base.contentHash);
    expect(mountOffset).toBeGreaterThan(work.endOffset);
    expect(workSource.indexOf(clientMount, mountOffset + clientMount.length)).toBe(-1);
    console.info("zone-route-mount: byte-identical");
  });

  it("rejects the client-report mount when it is planted inside the admitted region", () => {
    const source = readFileSync(indexPath, "utf8");
    const region = requireRegion(source, "work");
    const withoutMount = source.replace(`  ${clientMount}\n`, "");
    const planted = withoutMount.slice(0, region.endOffset - 1)
      + `  ${clientMount}\n`
      + withoutMount.slice(region.endOffset - 1);

    expect(resolveZoneRouteMountRegion(planted)).toMatchObject({ ok: false });
  });
});
