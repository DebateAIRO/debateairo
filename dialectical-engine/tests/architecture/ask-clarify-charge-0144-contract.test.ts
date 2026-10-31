import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0144 (plan 2026-10-31-r22-owner-changes decisions 29 and 31): step 2's small AI counts in the person's quota. One row per call naming the person,
 * the cost and the time, never the question or the suggestions; drained, because it redefines 0140's two readers.
 */
const NAME = "0144_ask_clarify_charge.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/ask-clarify-charge-forward0144.json";
const PREVIOUS = "0141_path_suggestions.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/path-suggestions-forward0141.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.ask_clarify_charge";

describe("0144: step 2's small AI in the person's quota", () => {
  it("C-T is a step of the chain's STEPS, after 0141, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0144 } from './migration-forward0144.js';");
    expect(chain).toContain("loadForward0141,loadForward0144");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
  });

  it("C-M is bound to 0141's manifest and to the verifier in force, and declares what it changes of 0140's digest", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "ask-clarify-charge-forward0144-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: [{ step: "0140_internal_spend_kinds.sql", field: "function_definition",
        functions: ["billing.read_internal_grant_spent(uuid,uuid,uuid,timestamptz,timestamptz,boolean)", "staff.read_team_internal_spent(timestamptz,timestamptz)"] }]
    });
  });

  it("C-H says truthfully that it is drained and keeps the verifier: it redefines two earlier functions", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("CREATE OR REPLACE FUNCTION billing.read_internal_grant_spent(");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION staff.read_team_internal_spent(");
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

  it("C-O stores the person, the cost and the time, and a funded call's grant: no text, no request role reads it", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
    const columns = sql.slice(at, sql.indexOf("\n);", at));
    expect([...columns.matchAll(/^ {2}([a-z_]+) (?:uuid|text|bigint|timestamptz|jsonb|bytea)/gmu)].map((match) => match[1]))
      .toEqual(["charge_id", "owner_ref", "funding_kind", "internal_grant_id", "internal_grant_event_id", "charge_micros", "recorded_at"]);
    expect(columns).not.toMatch(/question|suggestion|answer|ciphertext|content/u);
    expect(columns).toContain('REFERENCES identity."user"(owner_ref) ON DELETE CASCADE');
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
    expect(sql).toMatch(/^REVOKE ALL ON identity\.ask_clarify_charge FROM PUBLIC,/mu);
    expect([...sql.matchAll(/^GRANT [^\n]* ON identity\.ask_clarify_charge TO ([a-z_]+);$/gmu)].map((match) => match[1])).toEqual(["debateai_staff_security_owner"]);
  });

  it("C-D discloses its grants, lists its files, and every spending reader knows it", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const actual = [...read(SQL_PATH).matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(actual).toEqual(declared);
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain("packages/db/src/migration-forward0144.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/ask-clarify-charge-database.test.ts");
    expect(read("packages/budget/src/model-spend.ts").match(/identity\.read_ask_clarify_spent/gu)).toHaveLength(2);
    expect(read("packages/db/src/data-export.ts")).toContain("identity.read_data_export_ask_clarify($1,$2) ask_clarify_calls");
  });

  it("C-R is documented", () => {
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0144, below) the thirty-second", "## The small AI's quota charge (0144)", "`loadForward0144`", "MIGRATION_FORWARD0144_", "-- n1: drained", "-- n1: keeps-verifier", "renumber"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0144_ask_clarify_charge.sql` (after `0141_path_suggestions.sql`, `n1: drained`)");
  });
});
