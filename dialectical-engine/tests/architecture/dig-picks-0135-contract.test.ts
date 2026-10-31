// tests/architecture/dig-picks-0135-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames,
  type N1AuditContext
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0135 (dig-model revision 2026-10-30, task W3-7: the path rewrite switched on): a dig's picks (written once by the asks
 * route, each pick's text sealed under the dig's run key), the dig's own paths as its settled run gave them to its path
 * rewrite (sealed too, so the sweep can build the same material again) and the sweep's list of the settled digs whose
 * rewrite has no row. Followed by the investigation reports' 0136; `expand`, keeping 0130's verifier. No database here: the behaviour is
 * tests/integration/path-rewrite-database.test.ts.
 */
const NAME = "0135_dig_picks.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/dig-picks-forward0135.json";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/dig-model-forward0134.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const body = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};
const tableBody = (sql: string, table: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  return sql.slice(at, sql.indexOf("\n);", at));
};

const TABLES = ["identity.dig_pick_set", "identity.dig_pick", "identity.path_rewrite_input"] as const;
const CARRIERS = ["identity.dig_pick", "identity.path_rewrite_input"] as const;
const API = "identity.record_dig_picks(uuid,uuid,uuid,text,jsonb)";
const RUNTIME = [
  "identity.read_dig_picks_of_run(uuid)",
  "identity.record_path_rewrite_input(uuid,uuid,jsonb,bytea)",
  "identity.read_unwritten_path_rewrites(timestamptz,integer)"
] as const;
const FORGET = "identity.forget_erased_debate_dig_picks(uuid)";
const EXPORT_READER = "identity.read_data_export_dig_picks(uuid,uuid)";
const GUARD = "identity.guard_dig_pick_record()";
const SIGNATURES = [GUARD, API, ...RUNTIME, FORGET, EXPORT_READER] as const;
const ROLES = ["debateai_runtime", "debateai_billing_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime",
  "debateai_replay", "debateai_data_export_worker"] as const;

describe("0135: a dig's picks and its path rewrite's material", () => {
  it("C-T follows 0134 in the chain's STEPS (the investigation reports' 0136 comes after it), with its own loader", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0133,loadForward0134,loadForward0135,loadForward0136]);");
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("import { loadForward0135 } from './migration-forward0135.js';");
    const loader = read("packages/db/src/migration-forward0135.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "dig-picks-forward0135-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/dig-picks-forward0135.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain('const PREVIOUS = "0134_dig_model_and_month_pause.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0135_");
    expect(loader).toContain("export async function loadForward0135(");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of SIGNATURES) expect(loader).toContain(`"${signature}"`);
    // It adds no ledger constraint, so its evidence pins its own tables and functions only (0134's turn and rewrite
    // tables, which the sweep reads, keep 0134's postcondition).
    expect(loader).not.toContain("ledger.model_spend");
    expect(loader).not.toContain('"identity.path_rewrite_turn"');
    expect(loader).toContain("return sha(JSON.stringify({ tables, functions }));");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual(["0134_dig_model_and_month_pause.sql", NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.previousName).toBe("0134_dig_model_and_month_pause.sql");
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0134's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "dig-picks-forward0135-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: {
        name: "0134_dig_model_and_month_pause.sql",
        manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)),
        verifierSha256: VERIFIER_130
      },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    const sql = read(SQL_PATH);
    const lines = sql.split("\n");
    expect(lines).toContain("-- n1: expand");
    expect(lines).toContain("-- n1: keeps-verifier");
    expect(parseN1Header(NAME, sql)).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit, and only through its reviewed line", async () => {
    const sql = read(SQL_PATH);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((name) => /^\d{4}_.*\.sql$/u.test(name) && name < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    for (const signature of SIGNATURES) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    // Without its reviewed line, the owner block's dynamic SQL is refused (the only finding).
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1]))
      .toEqual(["N1_DYNAMIC_SQL"]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O creates only its three account tables (ON DELETE CASCADE), truncate-guarded and append-only, keeping no text in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      const columns = tableBody(sql, table);
      expect(columns, table).toMatch(/owner_ref uuid NOT NULL REFERENCES identity\."user"\(owner_ref\) ON DELETE CASCADE/u);
      // Text only in the envelope: no text, line, words or answer column in clear.
      expect(columns, table).not.toMatch(/\b(?:text|question|answer|answer_text|line|summary|reason_text|words|body|paths)\s+(?:text|jsonb)\b/u);
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER guard_dig_pick_record BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}\\n`, "u"));
    }
    // A pick and the material hang from the dig's set and go with it.
    expect(tableBody(sql, "identity.dig_pick")).toContain("run_id uuid NOT NULL REFERENCES identity.dig_pick_set(run_id) ON DELETE CASCADE");
    expect(tableBody(sql, "identity.path_rewrite_input")).toContain("run_id uuid PRIMARY KEY REFERENCES identity.dig_pick_set(run_id) ON DELETE CASCADE");
    expect(tableBody(sql, "identity.dig_pick")).toContain("CONSTRAINT dig_pick_pkey PRIMARY KEY (run_id, pick_no)");
    // The contract's 16 picks at most, its four suggestion kinds or the person's own view, and its three authors.
    expect(tableBody(sql, "identity.dig_pick_set")).toContain("CHECK (pick_count BETWEEN 0 AND 16)");
    expect(tableBody(sql, "identity.dig_pick")).toContain("CHECK (pick_no BETWEEN 1 AND 16)");
    expect(tableBody(sql, "identity.dig_pick")).toContain(
      "CHECK (kind IN ('CONTRADICTING','UNDOCUMENTED','NEEDS_MORE_WEB','HELPS_MAIN_QUESTION','OWN_VIEW'))");
    expect(tableBody(sql, "identity.dig_pick")).toContain("CHECK (author IN ('AI_SUGGESTION','PERSON_EDITED','PERSON_OWN_VIEW'))");
    expect(tableBody(sql, "identity.dig_pick")).toContain(
      "CHECK ((kind = 'OWN_VIEW') = (suggestion_id IS NULL) AND (kind = 'OWN_VIEW') = (author = 'PERSON_OWN_VIEW'))");
    // The guard admits no UPDATE at all: every row is insert-once; a DELETE only by the cascade or the forget definer.
    const guard = body(sql, "identity.guard_dig_pick_record");
    expect(guard).toContain("IF TG_OP = 'DELETE' AND (pg_catalog.current_setting('debateai.dig_picks_forget', true) = 'on'");
    expect(guard).not.toMatch(/TG_OP = 'UPDATE'/u);
    expect(guard).toContain("MESSAGE='DIG_PICKS_APPEND_ONLY'");
    // No earlier table is altered: 0134's turn and rewrite tables are only read.
    expect(sql).not.toMatch(/\bALTER TABLE (?!%s)/u);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE|DELETE FROM) identity\.path_rewrite(?:_turn)?\b(?!_input)/u);
  });

  it("C-C seals every text under the dig's run key, checked by 0132's content trigger (called, not redefined)", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.dig_pick\n"
      + "FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('pick_no');");
    expect(sql).toContain("CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.path_rewrite_input\n"
      + "FOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('run_id');");
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION identity\.enforce_web_evidence_content/u);
    for (const carrier of CARRIERS) {
      expect(tableBody(sql, carrier), carrier).toMatch(/content_ciphertext jsonb NOT NULL/u);
      expect(tableBody(sql, carrier), carrier).toContain("content_attestation bytea");
      expect(CONTENT_CARRIERS).toContain(carrier);
    }
    // The repository seals under the same carriers and the same bindings: the pick's number, the dig's run id.
    const repository = read("packages/db/src/dig-picks.ts");
    expect(repository).toContain('export const DIG_PICK_CARRIER = "identity.dig_pick" as const;');
    expect(repository).toContain('export const PATH_REWRITE_INPUT_CARRIER = "identity.path_rewrite_input" as const;');
    expect(repository).toContain("encryptAttestedContentForRun(this.pool, input.runId, DIG_PICK_CARRIER, String(at + 1),");
    expect(repository).toContain("encryptAttestedContentForRun(this.pool, runId, PATH_REWRITE_INPUT_CARRIER, runId.toLowerCase(), value)");
    // Re-exported through dig-model.ts, not the package index (its bytes are pinned by the migration audit).
    expect(read("packages/db/src/dig-model.ts")).toContain('export * from "./dig-picks.js";');
    expect(read("packages/db/src/index.ts")).not.toContain("dig-picks");
  });

  it("C-F defines its seven functions as definers with a fixed search path, and replaces no earlier one", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created.sort()).toEqual(SIGNATURES.map(nameOf).sort());
    for (const signature of SIGNATURES) {
      const name = nameOf(signature);
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    expect(body(code(sql), "identity.read_data_export_dig_picks")).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
    // The owner block gives the three tables and seven functions 0115's export owner, under its reviewed line.
    expect(sql).toContain("WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;");
    for (const signature of SIGNATURES) expect(sql).toContain(`    '${signature}'`);
  });

  it("C-L takes 0134's per-run lock in every writer and the deletion, before its owner checks", () => {
    const sql = code(read(SQL_PATH));
    const record = body(sql, "identity.record_dig_picks");
    expect(record).toContain("hashtextextended('identity:dig-model:' || LEAST(p_run_id, p_parent_run_id)::text, 0)");
    expect(record).toContain("hashtextextended('identity:dig-model:' || GREATEST(p_run_id, p_parent_run_id)::text, 0)");
    expect(record.indexOf("'identity:dig-model:'")).toBeLessThan(record.indexOf("identity.web_evidence_run_owner(p_run_id)"));
    expect(record.indexOf("RETURN 'ALREADY'")).toBeLessThan(record.indexOf("INSERT INTO"));
    // A dig only: its join to the parent's investigation must have taken (0133's member row).
    expect(record).toContain("RETURN 'NOT_A_DIG';");
    expect(record.indexOf("RETURN 'NOT_A_DIG'")).toBeLessThan(record.indexOf("INSERT INTO"));
    for (const name of ["identity.record_path_rewrite_input", "identity.forget_erased_debate_dig_picks"]) {
      const definer = body(sql, name);
      expect(definer, name).toContain("hashtextextended('identity:dig-model:' || p_run_id::text, 0)");
    }
    const input = body(sql, "identity.record_path_rewrite_input");
    expect(input.indexOf("'identity:dig-model:'")).toBeLessThan(input.indexOf("identity.web_evidence_run_owner(p_run_id)"));
    // No material without a path: picks under the main question have no rewrite.
    expect(input).toContain("AND pick_set.position_ref IS NOT NULL");
    // The sweep reads 0134's tables, writes nothing, and bounds its page.
    const sweep = body(sql, "identity.read_unwritten_path_rewrites");
    expect(sweep).toContain("p_limit NOT BETWEEN 1 AND 500");
    expect(sweep).toContain("LIMIT p_limit");
    expect(sweep).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/u);
    const sweepAt = sql.indexOf("CREATE OR REPLACE FUNCTION identity.read_unwritten_path_rewrites(");
    expect(sql.slice(sweepAt, sql.indexOf("AS $$", sweepAt))).toContain("\nSTABLE\n");
  });

  it("C-G grants one API function, three runtime functions, the deletion and the reader, and no table right", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      `GRANT EXECUTE ON FUNCTION ${API} TO debateai_billing_runtime;`,
      ...RUNTIME.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${FORGET} TO debateai_erasure_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(6);
    for (const table of TABLES) {
      expect(sql).toContain(`REVOKE ALL ON ${table} FROM PUBLIC,${ROLES.join(",")};`);
    }
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${GUARD} FROM PUBLIC;`);
    // The closing contract block checks the same, so a replay on a drifted database fails loudly.
    for (const message of ["DIG_PICKS_0135_CONTRACT tables", "DIG_PICKS_0135_CONTRACT table privilege",
      "DIG_PICKS_0135_CONTRACT content trigger", "DIG_PICKS_0135_CONTRACT definers", "DIG_PICKS_0135_CONTRACT privileges",
      "DIG_PICKS_0135_CONTRACT helper"]) expect(sql).toContain(message);
  });

  it("C-D (R22 item 16) deleting one debate deletes its picks and material, only once it is erased, after 0134's deletion", () => {
    const sql = code(read(SQL_PATH));
    const forget = body(sql, "identity.forget_erased_debate_dig_picks");
    expect(forget).toMatch(/IF p_run_id IS NULL OR NOT EXISTS \(SELECT 1 FROM serve\.private_run_erasure_tombstone[\s\S]*?MESSAGE='DIG_PICKS_DEBATE_NOT_ERASED';/u);
    expect(forget).toContain("PERFORM pg_catalog.set_config('debateai.dig_picks_forget', 'on', true);");
    expect(forget).toContain("DELETE FROM identity.path_rewrite_input AS input WHERE input.run_id = p_run_id;");
    expect(forget).toContain("DELETE FROM identity.dig_pick AS pick WHERE pick.run_id = p_run_id;");
    expect(forget).toContain("DELETE FROM identity.dig_pick_set AS pick_set WHERE pick_set.run_id = p_run_id;");
    // The digs dug FROM an erased debate keep their own picks (their own words, under their own keys).
    expect(forget).not.toContain("parent_run_id = p_run_id");
    const helper = read("packages/db/src/erasure-page-memory.ts");
    const digModel = helper.indexOf('"SELECT identity.forget_erased_debate_dig_model($1)"');
    const digPicks = helper.indexOf('"SELECT identity.forget_erased_debate_dig_picks($1)"');
    const commit = helper.indexOf('client.query("COMMIT")');
    expect(digModel).toBeGreaterThan(0);
    expect(digPicks).toBeGreaterThan(digModel);
    expect(commit).toBeGreaterThan(digPicks);
    expect(helper).toContain(`export const FORGET_ERASED_DEBATE_DIG_PICKS = "${FORGET}" as const;`);
    expect(read("packages/db/src/dig-picks.ts")).toContain(`export const FORGET_ERASED_DEBATE_DIG_PICKS = "${FORGET}" as const;`);
    expect(read("packages/db/src/account-erasure.ts")).toMatch(
      /FORGET_ERASED_DEBATE_DIG_MODEL,\n[^\n]*\n {2}FORGET_ERASED_DEBATE_DIG_PICKS\n\] as const\);/u);
  });

  it("C-E the export worker reaches the reader through 0128's lease, and its boot check counts it", () => {
    const exporter = read("packages/db/src/data-export.ts");
    expect(exporter).toContain(`"${EXPORT_READER}",`);
    expect(exporter.indexOf(`"${EXPORT_READER}",`)).toBeGreaterThan(exporter.indexOf('"identity.read_data_export_dig_model(uuid,uuid)",'));
    expect(exporter).toContain("worker.worker_count !== 15");
    expect(read("packages/db/src/dig-picks.ts")).toContain(`export const READ_DATA_EXPORT_DIG_PICKS = "${EXPORT_READER}" as const;`);
  });

  it("C-P discloses its grants and lists its files in the shipped corpus and the CI integration list", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)).toEqual([
      { roleName: "debateai_billing_runtime", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${API}`] },
      { roleName: "debateai_runtime", source: SQL_PATH, grants: RUNTIME.map((signature) => `EXECUTE ON FUNCTION ${signature}`) },
      { roleName: "debateai_data_export_worker", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${EXPORT_READER}`] }
    ]);
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of ["packages/db/src/dig-picks.ts", "packages/db/src/migration-forward0135.ts"]) expect(corpus).toContain(path);
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/path-rewrite-database.test.ts");
  });

  it("C-R is documented as the twenty-fifth step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain(
      "the dig model with the month pause (0134, below) the twenty-fourth, the dig picks (0135, below) the twenty-fifth");
    const heading = "## The dig picks (0135)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(readme.indexOf("## The dig model and the month pause (0134)"));
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-fifth", NAME, "dig-picks-forward0135.json", "packages/db/src/migration-forward0135.ts",
      "`loadForward0135`", "MIGRATION_FORWARD0135_", ...TABLES, "CONTENT_CARRIERS", "-- n1: expand", "-- n1: keeps-verifier",
      "identity.forget_erased_debate_dig_picks(uuid)", "identity.read_data_export_dig_picks(uuid,uuid)", "renumber"]) {
      expect(section, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain(
      "adds the database step `migrations/0135_dig_picks.sql` (after `0134_dig_model_and_month_pause.sql`, `n1: expand`)");
  });
});
