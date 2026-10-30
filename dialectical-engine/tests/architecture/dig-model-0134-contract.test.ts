// tests/architecture/dig-model-0134-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
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
 * 0134 (dig-model revision 2026-10-30, task W2-8, and its money rule of 31 Oct): each dig's level (at most 10) with the
 * nested join that refuses an eleventh, the path rewrite's turns and its encrypted, insert-once rewrites, the search
 * planner's decision for each path, the month pause
 * of a running debate, and the spend source PATH_REWRITE. The last step of the chain, `expand`, keeping 0130's verifier.
 * No database here: the behaviour is tests/integration/dig-model-database.test.ts.
 */
const NAME = "0134_dig_model_and_month_pause.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/dig-model-forward0134.json";
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

const TABLES = ["identity.investigation_dig_level", "identity.path_rewrite_turn", "identity.path_rewrite",
  "identity.web_plan_path", "identity.run_pause_event"] as const;
const API = [
  "identity.join_investigation_nested(uuid,uuid,uuid,text[],text)",
  "identity.read_dig_level(uuid,uuid)",
  "identity.read_investigation_dig_levels(uuid,uuid)",
  "identity.read_path_rewrites(uuid,uuid)",
  "identity.resume_paused_run(uuid,uuid)",
  "identity.read_run_pause(uuid,uuid)",
  "identity.read_paused_runs(uuid)"
] as const;
const RUNTIME = [
  "identity.read_dig_level_of_run(uuid)",
  "identity.take_path_rewrite_turn(uuid,uuid,text)",
  "identity.read_path_rewrite_turn(uuid)",
  "identity.record_path_rewrite(uuid,uuid,integer,uuid,text,text,text,text,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)",
  "identity.read_path_rewrites_of_run(uuid)",
  "identity.record_web_plan_path(uuid,text,text,smallint,jsonb,bytea)",
  "identity.read_web_plan(uuid)",
  "identity.record_run_pause(uuid,text,timestamptz,integer,integer,bigint)",
  "identity.read_run_pause_of_run(uuid)"
] as const;
const FORGET = "identity.forget_erased_debate_dig_model(uuid)";
const EXPORT_READER = "identity.read_data_export_dig_model(uuid,uuid)";
const PRIVATE = ["identity.guard_dig_model_record()", "identity.enforce_path_rewrite_content()",
  "identity.investigation_member_dig_level(uuid)", "identity.path_rewrite_entry_json(identity.path_rewrite_turn)",
  "identity.path_rewrites_json(uuid)", "identity.run_pause_json(uuid)"] as const;

/** Every .ts file under a source root, test fixtures and build output aside. */
function sources(directory: URL): string[] {
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path)) {
      if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
      const full = join(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(?:ts|tsx|mts)$/u.test(entry)) found.push(full);
    }
  };
  walk(directory.pathname);
  return found;
}

describe("0134: the dig model and the month pause", () => {
  it("C-T is the last step of the chain's STEPS, after 0133, with its own loader", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0132,loadForward0133,loadForward0134]);");
    const loader = read("packages/db/src/migration-forward0134.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "dig-model-forward0134-v1";');
    expect(loader).toContain('const PREVIOUS = "0133_investigations.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0134_");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of [...PRIVATE, ...API, ...RUNTIME, FORGET, EXPORT_READER]) expect(loader).toContain(`"${signature}"`);
    // Its own spend rule is pinned by expression only (a later step may validate it); 0074's shared list is not pinned.
    expect(loader).toContain('const OWN_CONSTRAINT = "model_spend_path_rewrite_names_its_run";');
    expect(loader).toContain("pg_get_expr(k.conbin,k.conrelid)");
    expect(loader).not.toContain("model_spend_spend_source_check");
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.slice(-2).map((step) => step.name)).toEqual(["0133_investigations.sql", NAME]);
    expect(plan.forwardChain.at(-1)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0133's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read("migrations/lineage/investigations-forward0133.json")) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "dig-model-forward0134-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: {
        name: "0133_investigations.sql",
        manifestSha256: sha256(read("migrations/lineage/investigations-forward0133.json")),
        verifierSha256: VERIFIER_130
      },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit, and only through its reviewed lines", async () => {
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
    for (const signature of [...PRIVATE, ...API, ...RUNTIME, FORGET, EXPORT_READER]) {
      expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    // Without its reviewed lines: the owner block's dynamic SQL and the two dropped spend constraints are refused.
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1]).sort())
      .toEqual(["N1_DYNAMIC_SQL", "N1_FORBIDDEN_DROP", "N1_FORBIDDEN_DROP", "N1_UNREVIEWED_RESTRICTION", "N1_UNREVIEWED_RESTRICTION"]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O creates only its five account tables (ON DELETE CASCADE), truncate-guarded and append-only, keeping no text in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      const columns = sql.slice(at, sql.indexOf("\n);", at));
      expect(columns, table).toMatch(/owner_ref uuid NOT NULL REFERENCES identity\."user"\(owner_ref\) ON DELETE CASCADE/u);
      // Text only in the envelope: no line, summary, reason, question or words column in clear.
      expect(columns, table).not.toMatch(/\b(?:question|answer_text|line|summary|reason_text|changed|words|body)\s+(?:text|jsonb)\b/u);
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER guard_dig_model_record BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}\\n`, "u"));
    }
    // The guard admits no UPDATE at all, so a rewrite is insert-once.
    const guard = body(sql, "identity.guard_dig_model_record");
    expect(guard).toContain("IF TG_OP = 'DELETE' AND (");
    expect(guard).not.toMatch(/TG_OP = 'UPDATE'/u);
    // 0133's member table is neither altered nor given a trigger; the level is keyed by the member.
    expect(sql).not.toMatch(/ALTER TABLE identity\.investigation_member\b/u);
    expect(sql).toContain("run_id uuid PRIMARY KEY REFERENCES identity.investigation_member(run_id) ON DELETE CASCADE");
    // The rewrite's only text is its envelope, checked on every insert; a FAILED one carries none.
    const rewrite = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS identity.path_rewrite ("));
    expect(rewrite).toContain("CONSTRAINT path_rewrite_one_per_dig UNIQUE");
    expect(rewrite).toContain("(outcome = 'FAILED') = (content_ciphertext IS NULL)");
    expect(sql).toContain("CREATE TRIGGER aaa_enforce_path_rewrite_content BEFORE INSERT ON identity.path_rewrite\n");
    expect(body(sql, "identity.enforce_path_rewrite_content")).toContain(
      "core.content_envelope_attestation_bytes(NEW.run_id, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, NEW.rewrite_id::text,");
    expect(CONTENT_CARRIERS).toContain("identity.path_rewrite");
    // The web plan: the planner's reason is model text, so only an envelope, checked by 0132's content trigger (called,
    // not redefined) and bound to the path; it is present exactly on NO_SEARCH_PLANNED; one row per run and path.
    const plan = sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS identity.web_plan_path ("));
    expect(plan).toContain("CONSTRAINT web_plan_path_pkey PRIMARY KEY (run_id, path_ref)");
    expect(plan).toContain("CHECK ((status = 'NO_SEARCH_PLANNED') = (content_ciphertext IS NOT NULL))");
    expect(plan).toContain("CHECK (status IN ('PLANNED','NO_SEARCH_PLANNED','NOT_ON_PLAN','SWITCHED_OFF','FAILED'))");
    expect(sql).toContain("CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON identity.web_plan_path\nFOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('path_ref');");
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION identity\.enforce_web_evidence_content/u);
    expect(body(sql, "identity.record_web_plan_path")).toContain("RETURN 'ALREADY';");
    expect(CONTENT_CARRIERS).toContain("identity.web_plan_path");
  });

  it("C-L bounds the dig level at 10, the contract's DIG_LEVEL_MAX, in the table and in the join, under 0133's locks", () => {
    const sql = code(read(SQL_PATH));
    expect(sql).toContain("CONSTRAINT investigation_dig_level_check CHECK (dig_level BETWEEN 1 AND 10)");
    const join = body(sql, "identity.join_investigation_nested");
    expect(join).toContain("IF v_level > 10 THEN\n    RETURN QUERY SELECT 'TOO_DEEP'::text");
    // The level is read after both of 0133's per-run locks, and TOO_DEEP returns before anything is written.
    const locked = join.indexOf("hashtextextended('identity:page-memory:' || GREATEST(p_parent_run_id, p_child_run_id)::text, 0)");
    const levelRead = join.indexOf("identity.investigation_member_dig_level(p_parent_run_id)");
    const tooDeep = join.indexOf("'TOO_DEEP'");
    expect(locked).toBeGreaterThan(0);
    expect(levelRead).toBeGreaterThan(locked);
    expect(tooDeep).toBeLessThan(join.indexOf("INSERT INTO"));
    expect(join).toContain("INSERT INTO identity.investigation_dig_level (run_id, owner_ref, dig_level) VALUES (p_child_run_id, p_owner_ref, v_level);");
    // The fill-in of 0133's members walks each root's digs and refuses, plainly, a chain past 10.
    expect(sql).toContain("DIG_LEVEL_0134_FILL_TOO_DEEP");
    expect(sql).toMatch(/INSERT INTO identity\.investigation_dig_level \(run_id, owner_ref, dig_level\)\nWITH RECURSIVE walk/u);
  });

  it("C-J no source calls 0133's join any more: the repository joins through the nested one", () => {
    const callers = [...sources(new URL("apps/", ROOT)), ...sources(new URL("packages/", ROOT)), ...sources(new URL("tools/", ROOT))]
      .filter((path) => /identity\.join_investigation\s*\(\s*\$/u.test(readFileSync(path, "utf8")));
    expect(callers).toEqual([]);
    expect(read("packages/db/src/investigations.ts")).toContain("FROM identity.join_investigation_nested($1,$2,$3,$4::text[],$5)");
  });

  it("C-P orders a path's rewrites by turn, each on the path's current text, one at a time under the path's lock", () => {
    const sql = code(read(SQL_PATH));
    const turn = body(sql, "identity.take_path_rewrite_turn");
    expect(turn).toContain("hashtextextended('identity:path-rewrite:' || p_parent_run_id::text || ':' || p_position_ref, 0)");
    expect(turn).toContain("SELECT COALESCE(max(turn.path_seq), 0) + 1 INTO v_seq");
    const record = body(sql, "identity.record_path_rewrite");
    expect(record.indexOf("hashtextextended('identity:path-rewrite:'")).toBeLessThan(record.indexOf("RETURN 'WAIT_TURN'"));
    expect(record.indexOf("RETURN 'WAIT_TURN'")).toBeLessThan(record.indexOf("RETURN 'BASE_MOVED'"));
    expect(record).toContain("AND rewrite.path_seq < v_turn.path_seq AND rewrite.outcome IN ('READY','READY_WITH_RESERVATION')");
  });

  it("C-F defines its functions as definers with a fixed search path, and replaces no earlier one", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created.sort()).toEqual([...PRIVATE, ...API, ...RUNTIME, FORGET, EXPORT_READER].map(nameOf).sort());
    for (const signature of [...API, ...RUNTIME, FORGET, EXPORT_READER, PRIVATE[0], PRIVATE[1]]) {
      const name = nameOf(signature);
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    expect(sql).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
  });

  it("C-G grants seven API functions, nine runtime functions, the deletion and the reader", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      ...API.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_billing_runtime;`),
      ...RUNTIME.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${FORGET} TO debateai_erasure_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(18);
    // 0133's join keeps its grant: an expand step revokes nothing the release before may call.
    expect(code(sql)).not.toMatch(/REVOKE[^;]*identity\.join_investigation\(/u);
  });

  it("C-S adds PATH_REWRITE to 0128's spend sources, NOT VALID, and the rewrite's charge names its run", () => {
    const sources = (value: string) => [...value.matchAll(/ADD CONSTRAINT model_spend_spend_source_check\s+CHECK \(spend_source IN \(([^)]+)\)\)/gu)][0]?.[1]
      ?.match(/'[^']+'/gu);
    const prior = read("migrations/0128_threat_reports.sql");
    const sql = read(SQL_PATH);
    expect(sources(sql)).toEqual([...(sources(prior) ?? []), "'PATH_REWRITE'"]);
    expect(code(sql)).toMatch(/ADD CONSTRAINT model_spend_spend_source_check\s+CHECK \([^;]+\) NOT VALID;/u);
    expect(code(sql)).toMatch(/ADD CONSTRAINT model_spend_path_rewrite_names_its_run\s+CHECK \(spend_source <> 'PATH_REWRITE' OR run_id IS NOT NULL\) NOT VALID;/u);
  });

  it("C-D (R22 item 16) deleting one debate deletes its pauses and rewrites, only once it is erased, after 0133's deletion", () => {
    const sql = code(read(SQL_PATH));
    const forget = body(sql, "identity.forget_erased_debate_dig_model");
    expect(forget).toMatch(/IF p_run_id IS NULL OR NOT EXISTS \(SELECT 1 FROM serve\.private_run_erasure_tombstone[\s\S]*?MESSAGE='DIG_MODEL_DEBATE_NOT_ERASED';/u);
    expect(forget).toContain("DELETE FROM identity.path_rewrite AS rewrite WHERE rewrite.run_id = p_run_id OR rewrite.parent_run_id = p_run_id;");
    expect(forget).toContain("DELETE FROM identity.path_rewrite_turn AS turn WHERE turn.run_id = p_run_id OR turn.parent_run_id = p_run_id;");
    expect(forget).toContain("DELETE FROM identity.run_pause_event AS event WHERE event.run_id = p_run_id;");
    expect(forget).toContain("DELETE FROM identity.web_plan_path AS plan WHERE plan.run_id = p_run_id;");
    const helper = read("packages/db/src/erasure-page-memory.ts");
    const investigation = helper.indexOf('"SELECT identity.forget_erased_debate_investigation($1)"');
    const digModel = helper.indexOf('"SELECT identity.forget_erased_debate_dig_model($1)"');
    expect(investigation).toBeGreaterThan(0);
    expect(digModel).toBeGreaterThan(investigation);
    expect(read("packages/db/src/account-erasure.ts")).toContain("FORGET_ERASED_DEBATE_DIG_MODEL\n] as const);");
    const exporter = read("packages/db/src/data-export.ts");
    expect(exporter).toContain(`"${EXPORT_READER}",`);
    expect(exporter).toContain("worker.worker_count !== 13");
  });

  it("C-R is documented as the twenty-fourth step", () => {
    const readme = read("migrations/lineage/README.md");
    const heading = "## The dig model and the month pause (0134)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(0);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-fourth", NAME, "dig-model-forward0134.json", "packages/db/src/migration-forward0134.ts",
      "`loadForward0134`", "MIGRATION_FORWARD0134_", ...TABLES, "PATH_REWRITE", "borrowing", "renumber"]) {
      expect(section, needle).toContain(needle);
    }
  });
});
