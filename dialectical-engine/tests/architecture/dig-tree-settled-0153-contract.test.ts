// tests/architecture/dig-tree-settled-0153-contract.test.ts
// 0153: a finished dig stops counting in the test site's start-of-debate estimate (R22, the end-to-end pass of 1 Nov 2026).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const NAME = "0153_dig_tree_settled.sql";
const SQL = read(`migrations/${NAME}`);

describe("0153: a dig's mark, read by the estimate", () => {
  it("follows 0152 in the chain, with its own loader, and is bound to its own bytes", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0152,loadForward0153,loadForward0154]");
    const previous = read("migrations/lineage/report-export-forward0152.json");
    const manifest = JSON.parse(read("migrations/lineage/dig-tree-settled-forward0153.json")) as { previous: { manifestSha256: string }; migration: { sha256: string } };
    expect(manifest.previous.manifestSha256).toBe(sha256(previous));
    expect(manifest.migration.sha256).toBe(sha256(SQL));
  });

  it("is expand and keeps the verifier: one new table, two new functions, nothing earlier redefined", () => {
    expect(parseN1Header(NAME, SQL)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect([...SQL.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual(["identity.dig_tree_settled"]);
    expect([...SQL.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gmu)].map((match) => match[1])).toEqual(["identity.mark_dig_tree_settled", "identity.dig_is_settled"]);
  });

  it("only the runtime reaches the two functions, and no role reads the table directly", () => {
    expect([...SQL.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([
      "EXECUTE ON FUNCTION identity.mark_dig_tree_settled(uuid) TO debateai_runtime;",
      "EXECUTE ON FUNCTION identity.dig_is_settled(uuid) TO debateai_runtime;"
    ]);
    expect(SQL).toContain("REVOKE ALL ON identity.dig_tree_settled FROM PUBLIC");
  });

  it("the estimate's story hold reads it, and only in the story branch: an open job stays held", () => {
    const estimate = read("apps/api/src/preview-budget-estimate.ts");
    const at = estimate.indexOf("AND NOT identity.dig_is_settled(run.run_id)");
    expect(at).toBeGreaterThan(estimate.indexOf("OR ($1::boolean"));
    expect(at).toBeLessThan(estimate.indexOf("LIMIT ${String(PREVIEW_UNFINISHED_RUNS_MAX + 1)}"));
  });
});
