import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveZoneRouteMountRegion } from "../support/zone-boundary.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const indexGitPath = "dialectical-engine/apps/api/src/index.ts";
const indexPath = fileURLToPath(new URL("../../apps/api/src/index.ts", import.meta.url));
const authorityRef = "d935aad03aa56e752016011c57a81c5d33d27680";
const fix01Ref = "24d0b3e5de84876b6b46fa84b13a0a42aa2640a4";
const admissionSubject = "chore(obs): compose FIX-04 reviewed dependencies";
const expectedApiBlob = "174ee8ff60461eb4f5aa233441b0367bb3d174b7";
const expectedZoneBytes = 1653;
const expectedZoneHash = "bff20f70edcff8df1f530a5b9f33417f1012017ce9c5e38edebb73b1d99f351d";
const expectedMounts = Object.freeze([
  Object.freeze({ verb: "post", path: "/v1/auth/register" }),
  Object.freeze({ verb: "post", path: "/v1/auth/verify-email" }),
  Object.freeze({ verb: "post", path: "/v1/auth/resend-verification" }),
]);

function gitText(args: readonly string[], failureCode: string): string {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    throw new Error(failureCode);
  }
}

function requiredBaseRef(): string {
  const value = process.env.FIX04_BASE_REF;
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error("FIX04_BASE_REF_REQUIRED_FULL_SHA");
  }
  const topology = gitText(
    ["rev-list", "--parents", "-n", "1", `${value}^{commit}`],
    "FIX04_BASE_REF_NOT_COMMIT",
  );
  if (topology !== `${value} ${authorityRef} ${fix01Ref}`) {
    throw new Error("FIX04_BASE_REF_TOPOLOGY_MISMATCH");
  }
  if (gitText(["log", "-1", "--format=%s", value], "FIX04_BASE_REF_NOT_COMMIT") !== admissionSubject) {
    throw new Error("FIX04_BASE_REF_SUBJECT_MISMATCH");
  }
  if (gitText(["rev-parse", `${value}:${indexGitPath}`], "FIX04_BASE_REF_API_BLOB_MISSING") !== expectedApiBlob) {
    throw new Error("FIX04_BASE_REF_API_BLOB_MISMATCH");
  }
  return value;
}

function readIndexSource(): string {
  return readFileSync(indexPath, "utf8");
}

function requireRegion(source: string, label: string) {
  const result = resolveZoneRouteMountRegion(source);
  if (!result.ok) throw new Error(`${label}:${result.reason}`);
  expect(result.mounts.map(({ verb, path }) => ({ verb, path }))).toEqual(expectedMounts);
  return result;
}

describe("FIX-04 per-slice zone delta", () => {
  it("matches the admitted immutable region to the worktree region", () => {
    const baseRef = requiredBaseRef();
    const baseSource = execFileSync("git", ["show", `${baseRef}:${indexGitPath}`], {
      cwd: root,
      encoding: "utf8",
    });
    const workSource = readIndexSource();
    const base = requireRegion(baseSource, "base");
    const work = requireRegion(workSource, "work");

    expect(base.bytes).toBe(expectedZoneBytes);
    expect(base.contentHash).toBe(expectedZoneHash);
    console.info("FIX04_ZONE_DELTA", JSON.stringify({
      baseRef,
      baseBytes: base.bytes,
      baseHash: base.contentHash,
      workBytes: work.bytes,
      workHash: work.contentHash,
    }));
    expect(work.region).toBe(base.region);
    expect(work.bytes).toBe(base.bytes);
    expect(work.contentHash).toBe(base.contentHash);
  });

  it("distinguishes an in-region edit from an offset-only edit and a missing mount", () => {
    const source = readIndexSource();
    const original = requireRegion(source, "original");
    const insertionOffset = source.indexOf("{", original.startOffset) + 1;
    expect(insertionOffset).toBeGreaterThan(original.startOffset);
    const changedInside = source.slice(0, insertionOffset)
      + " " + source.slice(insertionOffset);
    const inside = requireRegion(changedInside, "inside");
    expect(inside.contentHash).not.toBe(original.contentHash);

    const shifted = "\n".repeat(40) + source;
    const shiftedRegion = requireRegion(shifted, "shifted");
    expect(shiftedRegion.region).toBe(original.region);
    expect(shiftedRegion.contentHash).toBe(original.contentHash);

    const withoutMount = source.replace(
      'api.post("/v1/auth/register"',
      'api.get("/v1/auth/register"',
    );
    expect(withoutMount).not.toBe(source);
    expect(resolveZoneRouteMountRegion(withoutMount).ok).toBe(false);
  });
});
