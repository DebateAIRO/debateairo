import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0158 (V4 start step, plan 2026-11-03 Task 18; spec §5.2): the small AIs before Start count in the person's quota. One row per call naming the
 * person, the kind of call, the cost and the time, never the question, the lists or the paths; drained, because it redefines 0144's two readers.
 */
const NAME = "0158_pre_start_charge.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/pre-start-charge-forward0158.json";
const PREVIOUS = "0157_moderation_statements.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/moderation-statement-forward0157.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.pre_start_charge";
const READERS = ["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "staff.read_team_internal_spent(timestamptz,timestamptz)"];

describe("0158: the small AIs before Start in the person's quota", () => {
  it("C-T is a step of the chain, after 0157, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0158 } from './migration-forward0158.js';");
    expect(chain).toContain("loadForward0157,loadForward0158,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    // Its later-drift check covers what it adds to ledger.model_spend as well as its own objects, as 0128's does: the writer-only trigger
    // (the only barrier for a login whose row security admits a run-less row) and the run-less CHECK.
    const loader = read("packages/db/src/migration-forward0158.ts");
    for (const name of ["identity.pre_start_charge", "pre_start_spend_writer_only", "model_spend_pre_start_is_runless"]) expect(loader, name).toContain(name);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual([
      { step: "0140_internal_spend_kinds.sql", functions: READERS, field: "function_definition" },
      { step: "0144_ask_clarify_charge.sql", functions: READERS, field: "function_definition" }
    ]);
  });

  it("C-M is bound to 0157's manifest and to the verifier in force, and declares what it changes of 0140's and 0144's digests", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "pre-start-charge-forward0158-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: [
        { step: "0140_internal_spend_kinds.sql", functions: READERS, field: "function_definition" },
        { step: "0144_ask_clarify_charge.sql", functions: READERS, field: "function_definition" }
      ]
    });
  });

  it("C-H says truthfully that it is drained and keeps the verifier: it redefines two earlier functions", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(");
    // 0144's list, plus PRE_START: every earlier source stays allowed.
    expect(sql).toContain("CHECK (spend_source IN ('RUN','SUPPORT','STORY','LANGUAGE_CHECK','SYNTHESIS_CHECK','QUESTION_CHECK','PATH_REWRITE','INVESTIGATION_REPORT','PATH_CLIMB','ANSWER_UPDATE','CONTRIBUTION_CHECK','PUBLIC_REPORT','ASK_CLARIFY','PRE_START')) NOT VALID;");
    expect(sql).toContain("CHECK (spend_source <> 'PRE_START' OR (run_id IS NULL AND spend_phase IS NULL AND attempt_id IS NULL)) NOT VALID;");
  });

  it("C-A passes the replay audit, and no billing relation is new", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)]).toEqual([TABLE]);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME);
    expect(earlier.some((name) => definedRelationNames(read(`migrations/${name}`)).includes(TABLE))).toBe(false);
  });

  it("C-O stores the person, the kind, the cost and the time, and a funded call's grant: no text, no request role reads it", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:uuid|text|bigint|timestamptz|jsonb|bytea)/gmu)].map((match) => match[1]))
      .toEqual(["charge_id", "owner_ref", "kind", "funding_kind", "internal_grant_id", "internal_grant_event_id", "charge_micros", "recorded_at"]);
    expect(columns).not.toMatch(/question|suggestion|answer|ciphertext|content|path_text|list_text/u);
    expect(columns).toContain("CHECK (kind IN ('ANGLES', 'LIST', 'MERGE', 'MERGE_LATE', 'COMBINE', 'FIT'))");
    expect(columns).toContain('REFERENCES identity."user"(owner_ref) ON DELETE CASCADE');
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
    expect(sql).toContain("'^pre-start:(angles|list|merge|merge-late|combine|fit):[a-z0-9-]+:[A-Za-z0-9._/-]{1,128}$'");
    expect(sql).toMatch(/^REVOKE ALL ON identity\.pre_start_charge FROM PUBLIC,/mu);
    expect([...sql.matchAll(/^GRANT [^\n]* ON identity\.pre_start_charge TO ([a-z_]+);$/gmu)].map((match) => match[1])).toEqual(["debateai_staff_security_owner"]);
  });

  it("C-D discloses its grants, lists its files, and every spending reader knows it", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const actual = [...read(SQL_PATH).matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(actual).toEqual(declared);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain("packages/db/src/migration-forward0158.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/pre-start-charge-database.test.ts");
    expect(read("packages/budget/src/model-spend.ts").match(/identity\.read_pre_start_spent/gu)).toHaveLength(2);
    expect(read("packages/db/src/data-export.ts")).toContain("identity.read_data_export_pre_start($1,$2) pre_start_calls");
  });

  it("C-R is documented", () => {
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0158, below) the forty-eighth", "## The small AIs before Start in the quota (0158)", "`loadForward0158`", "MIGRATION_FORWARD0158_", "-- n1: drained", "-- n1: keeps-verifier"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0158_pre_start_charge.sql` (after `0157_moderation_statements.sql`, `n1: drained`)");
  });
});
