import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "../..");
const BASE = "7a9765efad4d639ac042179f626573f49efc9784";
const PROVENANCE_PATH = "docs/integration-provenance/fix10-product-surfaces.json";
const cases = [
  {
    path: "apps/scheduler/src/index.ts",
    contract: "fix09-byte-identity",
  },
  {
    path: "apps/api/src/index.ts",
    contract: "integrated-supersession",
    supersedes: ["FIX-04 C2/C3", "FIX-06 C0-C3"],
    sourceTips: [
      "b5eda1cbf9b8954ac598c5433931fb8f5aa9142f",
      "fbe5bc342002dfb0c7a62e08a0a5fdd395f56c3e",
    ],
    sha256: "a63a401b1ca7872572987defc1e91fcc1dc33c95290343a90747bda6047c58db",
  },
  {
    path: "packages/obs-capture/src/runtime/index.ts",
    contract: "integrated-supersession",
    supersedes: ["FIX-07 C1-C5", "FIX-08 C3/C4"],
    sourceTips: [
      "6ef0c4e393bdabd0b5d41df2d43d0d0557fd0ab5",
      "93a5ebc320f750b2349b40bf76f4761d83c93a7a",
    ],
    sha256: "38c157c816974282c13c6139d0a6f67b0ffe464c9da341db1eb926a29c4cb1cf",
  },
  {
    path: "migrations/0064_fix09_audit_chain.sql",
    contract: "fix09-byte-identity",
  },
] as const;

const provenance = JSON.parse(
  readFileSync(resolve(ROOT, PROVENANCE_PATH), "utf8"),
) as unknown;

describe("FIX-10 product invariance", () => {
  it.each(cases)("$path", (surface) => {
    expect(provenance).toEqual({
      schemaVersion: 1,
      base: BASE,
      surfaces: cases,
    });

    const actual = readFileSync(resolve(ROOT, surface.path));
    if (surface.contract === "fix09-byte-identity") {
      const expected = execFileSync(
        "git",
        ["show", `${BASE}:dialectical-engine/${surface.path}`],
        { cwd: ROOT },
      );
      expect(actual).toEqual(expected);
      return;
    }

    for (const sourceTip of surface.sourceTips) {
      expect(() => execFileSync(
        "git",
        ["merge-base", "--is-ancestor", sourceTip, "HEAD"],
        { cwd: ROOT },
      )).not.toThrow();
    }
    expect(createHash("sha256").update(actual).digest("hex"))
      .toBe(surface.sha256);
  });
});
