import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * 0145 (dig-model revision W4-4): one definer, on the runner's role only, reading ids and times; no table; it keeps 0130's verifier. Its manifest pins the file's bytes.
 */
const root = resolve(import.meta.dirname, "../../migrations");
const sql = readFileSync(resolve(root, "0145_web_researched_unsettled.sql"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "lineage/web-researched-unsettled-forward0145.json"), "utf8")) as {
  migration: { name: string; sha256: string }; previous: { name: string }; verifier: { path: string } };

describe("0145 the pages waiting after Add to researched", () => {
  it("is expand, keeps the verifier, follows 0144 and pins its own bytes", () => {
    expect(sql).toMatch(/^-- n1: expand$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    expect(manifest.previous.name).toBe("0144_ask_clarify_charge.sql");
    expect(manifest.verifier.path).toBe("lineage/verify-effective-capabilities-130.sql");
    expect(createHash("sha256").update(readFileSync(resolve(root, manifest.migration.name))).digest("hex")).toBe(manifest.migration.sha256);
  });
  it("adds one function and no table, on the runner's role only", () => {
    expect(sql).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP /u);
    expect(sql.match(/CREATE OR REPLACE FUNCTION/gu)).toHaveLength(1);
    expect(sql.match(/^GRANT .*$/gmu)).toEqual(["GRANT EXECUTE ON FUNCTION identity.read_unsettled_web_researched(integer) TO debateai_runtime;"]);
    expect(sql).toContain("REVOKE ALL ON FUNCTION identity.read_unsettled_web_researched(integer) FROM PUBLIC,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;");
    expect(sql).toContain("SECURITY DEFINER");
  });
  it("reads ids and times of unsettled, live choices only: no content", () => {
    const body = sql.slice(sql.indexOf("AS $$"), sql.indexOf("$$;"));
    expect(body).toContain("waiting.outcome IS NULL");
    expect(body).toContain("identity.web_evidence_run_owner(waiting.run_id) IS NOT NULL");
    expect(body).not.toMatch(/content|ciphertext/u);
  });
});
