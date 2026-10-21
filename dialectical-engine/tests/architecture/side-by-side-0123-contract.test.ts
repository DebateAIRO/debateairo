// tests/architecture/side-by-side-0123-contract.test.ts
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";

/**
 * 0123 (side-by-side uploads spec 2026-10-21 §1, §5; plan A, tasks A1-A5) is ONE chain step built section by section:
 * A1 gives it the release stamp on core.run and the encrypted insert path that writes it. It is the drained transition
 * upload's step (`-- n1: drained`) and adds no billing object, so 0111's effective verifier stays in force
 * (`-- n1: keeps-verifier`, migrations/lineage/README.md step 3).
 */
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const sql = read("migrations/0123_side_by_side_releases.sql");
const manifest = JSON.parse(read("migrations/lineage/side-by-side-releases-forward0123.json")) as Record<string, unknown> & {
  version: string; baseRecipeSha256: string;
  previous: { name: string; manifestSha256: string; verifierSha256: string };
  migration: { name: string; sha256: string };
  verifier: { path: string; sha256: string };
};
const shape = (value: unknown): unknown => typeof value === "object" && value !== null && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]).sort(([a], [b]) => String(a).localeCompare(String(b))))
  : typeof value;

describe("0123: the side-by-side releases step", () => {
  it("is appended last to the chain's STEPS, after the engine's map answer step", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0122,loadForward0123]");
    const loader = read("packages/db/src/migration-forward0123.ts");
    expect(loader).toContain("const NAME='0123_side_by_side_releases.sql';");
    expect(loader).toContain("const VERSION='side-by-side-releases-forward0123-v1';");
    expect(loader).toContain("const PREVIOUS='0122_engine_map_check.sql';");
    expect(loader).toContain("MIGRATION_FORWARD0123_");
  });

  it("has 0122's manifest shape, bound to 0122's manifest and to the verifier in force (0111's)", () => {
    const previous = JSON.parse(read("migrations/lineage/engine-map-check-forward0122.json")) as unknown;
    expect(shape(manifest)).toEqual(shape(previous));
    expect(manifest.version).toBe("side-by-side-releases-forward0123-v1");
    expect(manifest.previous.name).toBe("0122_engine_map_check.sql");
    expect(manifest.previous.manifestSha256).toBe(sha256(read("migrations/lineage/engine-map-check-forward0122.json")));
    expect(manifest.previous.verifierSha256).toBe(sha256(read("migrations/lineage/verify-effective-capabilities-111.sql")));
    expect(manifest.previous.verifierSha256.startsWith("aba0e0b3")).toBe(true);
    expect(manifest.migration).toEqual({ name: "0123_side_by_side_releases.sql", sha256: sha256(sql) });
    expect(manifest.verifier.path).toBe("lineage/verify-effective-capabilities-111.sql");
    expect(manifest.verifier.sha256).toBe(manifest.previous.verifierSha256);
  });

  it("declares itself drained and verifier-keeping in its leading comment block", () => {
    const lines = sql.split("\n");
    const header = lines.slice(0, lines.findIndex((line) => !line.startsWith("--")));
    expect(header.length).toBeGreaterThan(0);
    expect(header).toContain("-- n1: drained");
    expect(header).toContain("-- n1: keeps-verifier");
  });

  it("§1 adds core.run.release_key with its default and shape CHECK, replay-safe", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS release_key text NOT NULL DEFAULT 'legacy'");
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS run_release_key_shape");
    expect(sql).toContain("ADD CONSTRAINT run_release_key_shape CHECK (release_key = 'legacy' OR release_key ~ '^r[1-9][0-9]*-[0-9a-f]{12}$')");
  });

  it("§2 redefines core.create_encrypted_run in place: releaseKey admitted and written, its definer, path and grants re-asserted", () => {
    const start = sql.indexOf("CREATE OR REPLACE FUNCTION core.create_encrypted_run(");
    expect(start).toBeGreaterThan(0);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toContain("RETURNS boolean");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = pg_catalog");
    expect(body).toContain("'contentCiphertext','contentAttestation','contentAttestationSecret','releaseKey'");
    expect(body).toContain("COALESCE(p_run->>'releaseKey','legacy')");
    // startRun's capability probe reads these two names in the definition; they must survive the redefinition.
    expect(body).toContain("'planTier'");
    expect(body).toContain("'argumentLanguageTag'");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION core\.create_encrypted_run\(jsonb,uuid,uuid,jsonb\)\s+FROM PUBLIC,debateai_runtime,[^;]*debateai_content_provision;/u);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION core\.create_encrypted_run\(jsonb,uuid,uuid,jsonb\) TO debateai_content_provision;/u);
    // The closing contract checks what the file claims, by code.
    expect(sql).toContain("SIDE_BY_SIDE_RELEASE_STAMP_CONTRACT_INCOMPLETE");
  });

  it("is documented as the thirteenth step, keeping 0111's verifier", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme).toContain("## Side-by-side releases (0123)");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the engine's map answer step (0122, below) the twelfth and the side-by-side releases (0123, below) the thirteenth");
  });

  it("is the plan's last step, with no supplemental verifier", async () => {
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-1)?.name).toBe("0123_side_by_side_releases.sql");
    expect(plan.forwardChain.at(-2)?.name).toBe("0122_engine_map_check.sql");
    expect(plan.forwardChain.at(-1)?.replayVerifierSql).toBeUndefined();
    expect(plan.forwardChain.at(-1)?.verifierPath).toBe("lineage/verify-effective-capabilities-111.sql");
  });
});
