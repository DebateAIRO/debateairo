// tests/architecture/italy-approval-0125-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  definedFunctionNames,
  definedRelationNames,
  type N1AuditContext
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0125 (mission italy-clause-approval, slice S01, PLAN P05-P09): the Italy-specific approval as the chain step after
 * the settings activation 0124. Two nullable columns on legal.acceptance (clauses, leg), the kind and version CHECKs
 * widened for ITALY_SPECIFIC_APPROVAL, a new CHECK tying the two columns to that kind, the sign-up writer
 * identity.record_signup_italy_approval for the API's role and the export reader identity.read_data_export_snapshot_v2
 * for the export worker. An `expand` step that keeps 0111's effective verifier in force. No database here: the
 * behaviour is tests/integration/italy-approval-database.test.ts.
 */
const NAME = "0125_italy_specific_approval.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/italy-specific-approval-forward0125.json";
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0125 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");

describe("0125: the Italy-specific approval step", () => {
  it("C-T is appended last to the chain's STEPS, after 0124, with its own loader", () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0124,loadForward0125]");
    const loader = read("packages/db/src/migration-forward0125.ts");
    expect(loader).toContain("const NAME='0125_italy_specific_approval.sql';");
    expect(loader).toContain("const VERSION='italy-specific-approval-forward0125-v1';");
    expect(loader).toContain("const PREVIOUS='0124_settings_activation.sql';");
    expect(loader).toContain("MIGRATION_FORWARD0125_");
  });

  it("C-M has 0124's manifest shape, bound to 0124's manifest and to the verifier in force (0111's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read("migrations/lineage/settings-activation-forward0124.json")) as { baseRecipeSha256: string };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier"]);
    expect(manifest).toEqual({
      version: "italy-specific-approval-forward0125-v1",
      baseRecipeSha256: "3ad4ca844799fa0e498124250dba11683d0e305a2e3571468809ec5a6cec45c2",
      previous: {
        name: "0124_settings_activation.sql",
        manifestSha256: "860ea0de6288405ec798f03d17b45367a263c8d627bc7cbaa1082a765b87ffd7",
        verifierSha256: "aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a"
      },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-111.sql", sha256: "aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a" }
    });
    // The pinned digests are the files' own: 0124's manifest bytes, 0111's verifier bytes, 0124's recipe.
    expect(sha256(read("migrations/lineage/settings-activation-forward0124.json"))).toBe("860ea0de6288405ec798f03d17b45367a263c8d627bc7cbaa1082a765b87ffd7");
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-111.sql"))).toBe("aba0e0b3f47f3b351ac1b683804bce6ef4ad9f8b7e19c2191996408d7964f52a");
    expect(manifest.baseRecipeSha256).toBe(previous.baseRecipeSha256);
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit against every earlier migration, and only through its reviewed lines", () => {
    const sql = read(SQL_PATH);
    const earlier = readdirSync(new URL("../../migrations/", import.meta.url))
      .filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    // The context is the real one: 0080's table and 0115's export reader are earlier objects.
    expect(earlierRelations.has("legal.acceptance")).toBe(true);
    expect(earlierFunctions.has("identity.read_data_export_snapshot")).toBe(true);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    // Each reviewed line is load-bearing: without them the three CHECK swaps and the owner block are findings.
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    const findings = auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1]);
    expect(findings.filter((finding) => finding === "N1_FORBIDDEN_DROP")).toHaveLength(3);
    expect(findings.filter((finding) => finding === "N1_UNREVIEWED_RESTRICTION")).toHaveLength(3);
    expect(findings.filter((finding) => finding === "N1_DYNAMIC_SQL")).toHaveLength(1);
  });

  it("C-G grants exactly two EXECUTEs, each to its one role", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      "GRANT EXECUTE ON FUNCTION identity.record_signup_italy_approval(uuid,jsonb) TO debateai_billing_runtime;",
      "GRANT EXECUTE ON FUNCTION identity.read_data_export_snapshot_v2(uuid,uuid) TO debateai_data_export_worker;"
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(2);
  });

  it("C-R is documented as the fifteenth step, after the settings activation's section", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the side-by-side releases (0123, below) the thirteenth and the settings activation (0124, below) the fourteenth, and the Italy-specific approval (0125, below) the fifteenth.");
    const heading = "## The Italy-specific approval (0125)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(readme.indexOf("## The settings activation (0124)"));
    expect(readme.indexOf("## Replay: every applied step keeps its own checks")).toBeGreaterThan(at);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length));
    for (const needle of ["fifteenth", "0124", "0125_italy_specific_approval.sql", "italy-specific-approval-forward0125.json",
      "verify-effective-capabilities-111.sql", "packages/db/src/migration-forward0125.ts", "`loadForward0125`", "`STEPS`",
      "MIGRATION_FORWARD0125_", "legal.acceptance.clauses", "legal.acceptance.leg", "acceptance_kind_check",
      "acceptance_document_version_shape", "acceptance_italy_fields", "identity.record_signup_italy_approval(uuid,jsonb)",
      "identity.read_data_export_snapshot_v2(uuid,uuid)", "-- n1: expand", "-- n1: keeps-verifier", "replayVerifierSql",
      "If `origin/dev` takes 0125 first, renumber this step (rename every file and constant that carries the number, recompute the manifest, re-pin the chain lists)"]) {
      expect(section.replace(/\s+/gu, " "), needle).toContain(needle);
    }
  });
});
