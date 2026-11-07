// tests/architecture/region-iceland-liechtenstein-0154-contract.test.ts
// 0154: Iceland and Liechtenstein in the sign-up's Region list (the Europe row; owner request of 3 November 2026).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REGION_COUNTRY_CODES } from "@debateai/kernel";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0154_region_iceland_liechtenstein.sql";
const SQL = read(`migrations/${NAME}`);
const codesOf = (sql: string): string[] => [...(/registration_region_country_code_check CHECK \(country_code IN \(([^)]*)\)/u.exec(sql)?.[1] ?? "").matchAll(/'([A-Z]{2})'/gu)].map((match) => match[1]!);

describe("0154: the Region list's country CHECK widened by IS and LI", () => {
  it("follows 0153 in the chain, with its own loader, and is bound to its own bytes", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0153,loadForward0154,loadForward0155,loadForward0156,loadForward0157,loadForward0170]");
    const previous = read("migrations/lineage/dig-tree-settled-forward0153.json");
    const manifest = JSON.parse(read("migrations/lineage/region-iceland-liechtenstein-forward0154.json")) as { previous: { manifestSha256: string }; migration: { sha256: string } };
    expect(manifest.previous.manifestSha256).toBe(sha256(previous));
    expect(manifest.migration.sha256).toBe(sha256(SQL));
  });

  it("is expand and keeps the verifier: one reviewed CHECK swap, nothing else", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(SQL).not.toMatch(/CREATE (?:TABLE|OR REPLACE FUNCTION)|\bGRANT\b|\bREVOKE\b|VALIDATE CONSTRAINT/u);
    expect(SQL).toContain("-- n1: reviewed widens the country list by IS and LI; every code the release before writes stays accepted\nALTER TABLE identity.registration_region DROP CONSTRAINT IF EXISTS registration_region_country_code_check;\nALTER TABLE identity.registration_region ADD CONSTRAINT registration_region_country_code_check CHECK");
    expect(SQL.trimEnd().endsWith(") NOT VALID;")).toBe(true);
  });

  it("is 0095's list plus exactly IS and LI, in region.ts's order", () => {
    const before = codesOf(read("migrations/0095_registration_region.sql"));
    const after = codesOf(SQL);
    expect(after.filter((code) => !before.includes(code))).toEqual(["IS", "LI"]);
    expect(before.every((code) => after.includes(code))).toBe(true);
    expect(after).toEqual([...REGION_COUNTRY_CODES]);
  });
});
