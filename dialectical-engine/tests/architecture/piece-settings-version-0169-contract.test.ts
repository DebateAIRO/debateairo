import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0169 (V4 start step, plan 2026-11-03 Task 57o-fix; the owner's answers of 8 Nov: "Use today's settings", then "Your switched-on one
 * (Recommended)": "The report uses 25, exactly as Continue and new debates do. Needs one small permission: the runner may read which settings
 * are switched on (a number, nothing private), added in the same database step as the records (0169)."): a piece of an older debate whose
 * own settings the runner refuses is written with the owners' switched-on version, so the runner's role may now call 0124's pointer reader.
 * Task 57p (the owner's answer of 8 Nov, "On each piece's record": "A new field on each of the eight records (report, rewrite, checks, …)
 * saying which settings wrote that piece. Most precise per piece."): eight records gain a nullable settings_version, and ten new writers,
 * each the earlier one word for word plus that one value, store it. Rows written before the step, and rows the release before still writes
 * through the earlier writers, keep NULL (unknown); nothing is back-filled.
 */
const NAME = "0169_piece_settings_version.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/piece-settings-version-forward0169.json";
const LOADER_PATH = "packages/db/src/migration-forward0169.ts";
const PREVIOUS = "0168_set_aside_continue.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/set-aside-continue-forward0168.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const READER = "register.read_active_settings_version()";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const flat = (text: string): string => text.replace(/\s+/gu, " ").trim();

/** The eight records (Task 57o's map, wave19-report-oldsettings.json "records"), each with the step that made its table. */
const TABLES = [
  { table: "identity.web_reading", step: "0132_web_evidence.sql" },
  { table: "identity.path_rewrite", step: "0134_dig_model_and_month_pause.sql" },
  { table: "identity.investigation_report", step: "0136_investigation_reports.sql" },
  { table: "identity.path_update", step: "0138_tree_updates.sql" },
  { table: "identity.main_answer_update", step: "0138_tree_updates.sql" },
  { table: "identity.public_answer_update", step: "0147_public_tree.sql" },
  { table: "identity.public_contribution_check", step: "0147_public_tree.sql" },
  { table: "identity.public_report", step: "0147_public_tree.sql" }
] as const;
/** The writers the runner calls for them, each superseded by `<name>_with_settings(<the same arguments>, bigint)`. */
const WRITERS = [
  { name: "identity.record_web_reading", step: "0132_web_evidence.sql", args: "uuid,uuid,uuid,smallint,text,text,smallint,jsonb,bytea" },
  { name: "identity.record_path_rewrite", step: "0134_dig_model_and_month_pause.sql",
    args: "uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea" },
  { name: "identity.record_investigation_report_version", step: "0136_investigation_reports.sql",
    args: "uuid,integer,uuid,text,text,text,uuid,timestamptz,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea" },
  { name: "identity.record_path_update", step: "0138_tree_updates.sql", args: "uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea" },
  { name: "identity.record_path_rewrite_in_line", step: "0138_tree_updates.sql",
    args: "text,uuid,uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea" },
  { name: "identity.record_main_answer_update", step: "0138_tree_updates.sql",
    args: "uuid,uuid,uuid,text,uuid,uuid,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea" },
  { name: "identity.record_public_path_update", step: "0147_public_tree.sql", args: "uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea" },
  { name: "identity.record_public_check_passed", step: "0147_public_tree.sql", args: "uuid,uuid" },
  { name: "identity.record_public_answer_update", step: "0147_public_tree.sql",
    args: "uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea" },
  { name: "identity.record_public_report", step: "0147_public_tree.sql",
    args: "uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea" }
] as const;
const NEW_SIGNATURES = WRITERS.map(({ name, args }) => `${name}_with_settings(${args},bigint)`);
const AMENDS = [
  { step: "0124_settings_activation.sql", functions: [READER], grantees: ["debateai_runtime"], field: "function_acl" },
  { step: "0132_web_evidence.sql", relations: ["identity.web_reading"], columns: ["settings_version"], field: "column_added" },
  { step: "0134_dig_model_and_month_pause.sql", relations: ["identity.path_rewrite"], columns: ["settings_version"], field: "column_added" },
  { step: "0136_investigation_reports.sql", relations: ["identity.investigation_report"], columns: ["settings_version"], field: "column_added" },
  { step: "0138_tree_updates.sql", relations: ["identity.main_answer_update", "identity.path_update"], columns: ["settings_version"], field: "column_added" },
  { step: "0147_public_tree.sql", relations: ["identity.public_answer_update", "identity.public_contribution_check", "identity.public_report"],
    columns: ["settings_version"], field: "column_added" }
];
const checkOf = (table: string): string => `${table.slice(table.indexOf(".") + 1)}_settings_version_check`;

/** A function's whole text, from its CREATE to its closing `$$;`. */
function functionText(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("\n$$;", start);
  expect(end, name).toBeGreaterThan(start);
  return sql.slice(start, end + 4);
}

describe("0169: the runner may read which settings are switched on (owner, 8 Nov: \"Your switched-on one\")", () => {
  it("C-T is a step of the chain right after 0168, with its own loader and its amendments: 0124's reader gains a grant, five steps' tables a column", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0169 } from './migration-forward0169.js';");
    expect(chain).toContain("loadForward0167,loadForward0168,loadForward0169");
    // The amendment kinds 0169 needs: a grant on a function an earlier step's digest pins; a column on a table an earlier step's digest pins.
    expect(chain).toContain("|Readonly<{step:string;functions:readonly string[];grantees:readonly string[];field:'function_acl'}>");
    expect(chain).toContain("|Readonly<{step:string;relations:readonly string[];columns:readonly string[];field:'column_added'}>");
    const plan = await loadMigrationPlan();
    const at = plan.forwardChain.findIndex((step) => step.name === NAME);
    expect(at).toBeGreaterThan(0);
    const step = plan.forwardChain[at]!;
    expect(step.previousName).toBe(PREVIOUS);
    expect(plan.forwardChain[at - 1]!.name).toBe(PREVIOUS);
    expect(step.previousManifestSha256).toBe(plan.forwardChain[at - 1]!.manifestSha256);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.replayVerifierSql).toBeUndefined();
    expect(step.amendsPostconditionsOf).toEqual(AMENDS);
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "piece-settings-version-forward0169-v1";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain(`const FUNCTIONS = ["${READER}", ...WRITERS] as const;`);
    for (const signature of NEW_SIGNATURES) expect(loader, signature).toContain(`"${signature}"`);
    for (const { table } of TABLES) expect(loader, table).toContain(`"${table}"`);
    expect(loader).toContain("MIGRATION_FORWARD0169_");
  });

  it("C-M is bound to 0168's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "piece-settings-version-forward0169-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it is expand and keeps the verifier; both audits pass; no table; its only functions the ten new writers", async () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort()) {
      for (const defined of definedFunctionNames(read(`migrations/${name}`))) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(read(`migrations/${name}`))) earlierRelations.add(defined);
    }
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, { earlierFunctions, earlierRelations, keepsVerifier: true })).toEqual([]);
    expect([...definedRelationNames(sql)]).toEqual([]);
    expect([...definedFunctionNames(sql)].sort()).toEqual(WRITERS.map(({ name }) => `${name}_with_settings`).sort());
    for (const { name } of WRITERS) expect(earlierFunctions.has(`${name}_with_settings`), name).toBe(false);
    // The only top-level ALTERs: per record, its column (nullable, no default: no row is rewritten or back-filled) and its CHECK (> 0, NOT
    // VALID: every row already there is NULL, and the step that adds a constraint never validates it, N1_STRONG_LOCK_VALIDATE).
    expect([...code(sql).matchAll(/^ALTER\b[^;]*;/gmu)].map((match) => flat(match[0]))).toEqual(TABLES.flatMap(({ table }) => [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS settings_version bigint NULL;`,
      `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${checkOf(table)};`,
      `ALTER TABLE ${table} ADD CONSTRAINT ${checkOf(table)} CHECK (settings_version > 0) NOT VALID;`
    ]));
    // No statement of its own drops, revokes or touches a row (function bodies are indented; the N-1 audit above reads the rest).
    expect(code(sql)).not.toMatch(/^(DROP|REVOKE|UPDATE|DELETE|INSERT)\b/mu);
    expect(code(sql)).not.toMatch(/\bDROP\s+FUNCTION\b/iu);
  });

  it("C-W each new writer is its earlier writer word for word, with p_settings_version last and stored on the row it writes", () => {
    const sql = read(SQL_PATH);
    for (const { name, step } of WRITERS) {
      const fresh = functionText(sql, `${name}_with_settings`);
      const earlier = functionText(read(`migrations/${step}`), name);
      expect(fresh, name).toMatch(/, p_settings_version bigint\)\s*(RETURNS|\n)/u);
      // Stored on the row: the INSERT names the column and the value, or (the public report, opened earlier by the API) the UPDATE sets it.
      if (name === "identity.record_public_report") {
        expect(fresh).toContain("settings_version = p_settings_version,");
      } else if (name === "identity.record_path_rewrite_in_line") {
        expect(fresh).toContain("RETURN identity.record_path_rewrite_with_settings(");
        expect(flat(fresh)).toContain("p_artifact_refs, p_content, p_attestation, p_settings_version);");
      } else {
        expect(flat(fresh), name).toMatch(/content_attestation, settings_version\)|check_ref, settings_version\)|content_attestation, settings_version\) VALUES/u);
        expect(flat(fresh), name).toMatch(/p_attestation, p_settings_version\);|p_check_ref, p_settings_version\);/u);
      }
      const back = fresh
        .replaceAll("_with_settings(", "(")
        .replace(/, p_settings_version bigint\)/u, ")")
        .replaceAll("settings_version = p_settings_version, ", "")
        .replaceAll(", p_settings_version)", ")")
        .replaceAll(", settings_version)", ")");
      expect(flat(back), name).toBe(flat(earlier));
    }
  });

  it("C-G the grants: the pointer reader and the ten writers to the runner's role only; owners as their earlier writers'; checked in the file", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([
      `EXECUTE ON FUNCTION ${READER} TO debateai_runtime;`,
      ...NEW_SIGNATURES.map((signature) => `EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`)
    ]);
    // The file never reads the pointer (only the grant names the reader as a call; the contract check finds it by name in the catalog).
    expect(sql).not.toMatch(/\b(?:FROM|JOIN)\s+register[.]settings_activation\b/iu);
    expect([...sql.matchAll(/register[.]read_active_settings_version\s*\(\s*\)/giu)]).toHaveLength(1);
    // Each new writer takes its earlier writer's owner and loses PUBLIC and every runtime role before the one grant (0166's shape).
    const whole = read(SQL_PATH);
    expect(whole).toContain("-- n1: reviewed gives only the ten new writers the owners of the writers they supersede; touches no earlier object");
    for (const { name, args } of WRITERS) expect(whole, name).toContain(`['${name}_with_settings(${args},bigint)', '${name}(${args})']`);
    expect(whole).toContain("'REVOKE ALL ON FUNCTION %s FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker'");
    for (const needle of ["PIECE_SETTINGS_VERSION_0169_CONTRACT reader grant", "PIECE_SETTINGS_VERSION_0169_CONTRACT pointer table %",
      "PIECE_SETTINGS_VERSION_0169_CONTRACT column %", "PIECE_SETTINGS_VERSION_0169_CONTRACT writer %"]) {
      expect(sql).toContain(`RAISE EXCEPTION '${needle}'`);
    }
    // The header says the owner's rules and why the runner may now read the pointer.
    const lines = read(SQL_PATH).split("\n");
    expect(lines).toContain("-- n1: expand");
    expect(lines).toContain("-- n1: keeps-verifier");
    const header = lines.filter((line) => line.startsWith("--")).map((line) => line.replace(/^--\s?/u, "")).join(" ").replace(/\s+/gu, " ");
    for (const needle of ["Your switched-on one (Recommended)", "a number, nothing private", "Use today's settings", "the runner's role may now call the reader",
      "On each piece's record", "which settings wrote that piece", "Rows written before this step keep NULL (unknown), never back-filled",
      "the release before still writes through the earlier writers",
      // Task 57o-fix2 (review finding 4): the grant reaches the runtime role's members too, and says why that is harmless.
      "also reaches the roles that are its members (debateai_authorization_runtime", "harmless: the reader answers a version number, nothing private"]) {
      expect(header, needle).toContain(needle);
    }
  });

  it("C-X nothing reads the new column yet: no export reader, no API export code, no reader of these records names it", () => {
    // The person's data export copies these records key by key (jsonb_build_object), never whole rows, so the column stays out with no change.
    for (const name of readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry)).sort()) {
      const sql = read(`migrations/${name}`);
      for (const match of sql.matchAll(/CREATE OR REPLACE FUNCTION (identity\.read_[a-z0-9_]+)\(/gu)) {
        const end = sql.indexOf("\n$$;", match.index);
        // The column as a word (register.settings_version_passed and identity.run_settings_version_now are other names).
        expect(sql.slice(match.index, end), `${name} ${match[1]}`).not.toMatch(/(?<![\w.])settings_version\b/u);
      }
    }
    for (const file of readdirSync(new URL("apps/api/src/data-export/", ROOT)).filter((entry) => entry.endsWith(".ts"))) {
      expect(read(`apps/api/src/data-export/${file}`), file).not.toMatch(/settings_version|settingsVersion/u);
    }
  });

  it("C-D documented and listed: the lineage README, the preview's README, the principals manifest, the shipped corpus", () => {
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0169, below) the fifty-ninth", "## The runner reads which settings are switched on (0169)", "`loadForward0169`",
      "MIGRATION_FORWARD0169_", "`-- n1: expand`", "`function_acl`", "`column_added`", "`settings_version`", "On each piece's record"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0169_piece_settings_version.sql` (after `0168_set_aside_continue.sql`, `n1: expand`)");
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("each of eight records notes which settings version wrote it");
    const principals = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(principals.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)).toEqual([
      { roleName: "debateai_runtime", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${READER}`, ...NEW_SIGNATURES.map((signature) => `EXECUTE ON FUNCTION ${signature}`)] }]);
  });
});
