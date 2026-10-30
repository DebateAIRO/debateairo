// tests/architecture/investigations-0133-contract.test.ts
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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
 * 0133 (Perplexity plan 2026-10-30, task W1-3; owner answers Q2, Q4, Q5): investigations (a debate and its digs as one
 * budget unit), their members (the server-side dig parent), their closings by report version (kept on reopening) and
 * the person's one reserve, all account-owned (ON DELETE CASCADE), with the page texts' wipe on closing and after 30
 * days without activity. The last step of the chain, `expand`, keeping 0130's verifier. No database here: the
 * behaviour is tests/integration/investigations-database.test.ts.
 */
const NAME = "0133_investigations.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/investigations-forward0133.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));

const TABLES = ["identity.investigation", "identity.investigation_member", "identity.investigation_closing",
  "identity.investigation_reserve_event"] as const;
const API = [
  "identity.open_investigation(uuid,uuid)",
  "identity.join_investigation(uuid,uuid,uuid,text[],text)",
  "identity.touch_investigation(uuid,uuid)",
  "identity.close_investigation(uuid,uuid)",
  "identity.reopen_investigation(uuid,uuid)",
  "identity.read_investigation(uuid,uuid)",
  "identity.record_reserve_event(uuid,text,bigint,uuid,integer,text,timestamptz)"
] as const;
const RUNTIME = [
  "identity.read_reserve(uuid)",
  "identity.read_investigation_of_run(uuid)",
  "identity.record_investigation_report(uuid,integer,uuid)",
  "identity.wipe_inactive_web_page_text(integer)"
] as const;
const FORGET = "identity.forget_erased_debate_investigation(uuid)";
const EXPORT_READER = "identity.read_data_export_investigations(uuid,uuid)";
const PRIVATE = ["identity.guard_investigation_record()", "identity.wipe_investigation_page_text(uuid)",
  "identity.investigation_json(uuid)"] as const;
const body = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};

describe("0133: the investigations step", () => {
  it("C-T is the last step of the chain's STEPS, after 0132, with its own loader", async () => {
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("loadForward0131,loadForward0132,loadForward0133]);");
    const loader = read("packages/db/src/migration-forward0133.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "investigations-forward0133-v1";');
    expect(loader).toContain('const PREVIOUS = "0132_web_evidence.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0133_");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of [...PRIVATE, ...API, ...RUNTIME, FORGET, EXPORT_READER]) expect(loader).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.slice(-2).map((step) => step.name)).toEqual(["0132_web_evidence.sql", NAME]);
    expect(plan.forwardChain.at(-1)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0132's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read("migrations/lineage/web-evidence-forward0132.json")) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "investigations-forward0133-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: {
        name: "0132_web_evidence.sql",
        manifestSha256: sha256(read("migrations/lineage/web-evidence-forward0132.json")),
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

  it("C-A passes the N-1 audit and the replay audit, and only through its one reviewed owner block", async () => {
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
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    for (const signature of [...PRIVATE, ...API, ...RUNTIME, FORGET, EXPORT_READER]) {
      expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    }
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1])).toEqual(["N1_DYNAMIC_SQL"]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O creates only its four account tables (ON DELETE CASCADE), truncate-guarded, keeping no text", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      const columns = sql.slice(at, sql.indexOf("\n);", at));
      expect(columns, table).toMatch(/owner_ref uuid NOT NULL REFERENCES identity\."user"\(owner_ref\) ON DELETE CASCADE/u);
      expect(columns, table).not.toMatch(/\b(?:question|answer|report_text|line|body|content\w*)\s+(?:text|jsonb)\b/u);
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
    }
    // Members, closings and reserve events are append-only (the closing's two set-once marks aside).
    for (const table of TABLES.slice(1)) {
      expect(sql, table).toContain(`CREATE TRIGGER guard_investigation_record BEFORE UPDATE OR DELETE ON ${table}\n`);
    }
    // The one reserve: an event list per account, its state the newest event; a reserve is never held twice.
    const reserve = body(sql, "identity.record_reserve_event");
    expect(reserve).toContain("WHEN 'HELD' THEN v_state IN ('NONE','USED','RELEASED') OR (v_state = 'BLOCKED' AND v_last.blocked_until <= clock_timestamp())");
    expect(reserve).toContain("WHEN 'USED' THEN v_state = 'HELD'");
    expect(reserve).toContain("WHEN 'RELEASED' THEN v_state = 'HELD'");
    expect(reserve).toContain("ELSE v_state <> 'HELD' END;\n  IF NOT v_allowed THEN\n    RETURN 'NOT_ALLOWED';");
    expect(reserve.indexOf("pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:reserve:' ||")).toBeLessThan(reserve.indexOf("SELECT * INTO v_last"));
  });

  it("C-W wipes the page texts when an investigation closes and 30 days after its last activity, open or not", () => {
    const sql = code(read(SQL_PATH));
    const close = body(sql, "identity.close_investigation");
    expect(close).toContain("INSERT INTO identity.investigation_closing (investigation_id, report_version, owner_ref)");
    expect(close).toContain("identity.wipe_investigation_page_text(p_investigation_id)");
    expect(body(sql, "identity.wipe_investigation_page_text")).toContain("DELETE FROM identity.web_page_text AS kept WHERE kept.run_id = v_run;");
    const sweep = body(sql, "identity.wipe_inactive_web_page_text");
    expect(sweep).toContain("v_cutoff timestamptz := clock_timestamp() - interval '30 days';");
    expect(sweep).toContain("WHERE COALESCE(investigation.last_activity_at, kept.stored_at) < v_cutoff");
    expect(sweep).not.toMatch(/state\s*=\s*'closed'/u);
    // A reopening keeps every earlier closing (the report versions); nothing deletes a closing but the debate's deletion.
    const reopen = body(sql, "identity.reopen_investigation");
    expect(reopen).toContain("UPDATE identity.investigation_closing SET reopened_at = clock_timestamp()");
    expect(reopen).not.toMatch(/DELETE/u);
    // Joining writes 0131's dig link in the same transaction, under 0131's lock (the server-side dig parent).
    const join = body(sql, "identity.join_investigation");
    expect(join).toContain("INSERT INTO identity.dig_link (child_run_id, owner_ref, parent_run_id, places, mode)");
    expect(join).toContain("hashtextextended('identity:page-memory:' || LEAST(p_parent_run_id, p_child_run_id)::text, 0)");
  });

  it("C-F defines its functions as definers with a fixed search path, and replaces no earlier one", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gu)].map((match) => match[1]);
    expect(created.sort()).toEqual([...PRIVATE, ...API, ...RUNTIME, FORGET, EXPORT_READER].map(nameOf).sort());
    for (const signature of [...API, ...RUNTIME, FORGET, EXPORT_READER, PRIVATE[0]]) {
      const name = nameOf(signature);
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      const head = sql.slice(at, sql.indexOf("AS $$", at));
      expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    expect(sql).toContain("v_user := identity.data_export_lease_user(p_export_id, p_worker);");
  });

  it("C-G grants seven API functions, four runtime functions, the deletion and the reader", () => {
    const sql = read(SQL_PATH);
    expect(sql.split("\n").filter((line) => /^\s*GRANT\b/u.test(line))).toEqual([
      ...API.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_billing_runtime;`),
      ...RUNTIME.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${FORGET} TO debateai_erasure_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    expect(code(sql).match(/\bGRANT\b/gu)).toHaveLength(13);
  });

  it("C-D (R22 item 16) deleting one debate deletes its investigation rows, only once it is erased; reserve events stay with the account", () => {
    const sql = code(read(SQL_PATH));
    const forget = body(sql, "identity.forget_erased_debate_investigation");
    expect(forget).toMatch(/IF p_run_id IS NULL OR NOT EXISTS \(SELECT 1 FROM serve\.private_run_erasure_tombstone[\s\S]*?MESSAGE='INVESTIGATION_DEBATE_NOT_ERASED';/u);
    expect(forget).toContain("DELETE FROM identity.investigation AS investigation WHERE investigation.root_run_id = p_run_id;");
    expect(forget).toContain("WITH RECURSIVE gone(run_id) AS (");
    expect(forget).not.toMatch(/investigation_reserve_event/u);
  });

  it("C-R is documented as the twenty-third step", () => {
    const readme = read("migrations/lineage/README.md");
    const heading = "## The web evidence store (0132) and investigations (0133)";
    const at = readme.indexOf(heading);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-third", NAME, "investigations-forward0133.json", "packages/db/src/migration-forward0133.ts",
      "`loadForward0133`", "MIGRATION_FORWARD0133_", ...TABLES, "30 days", "renumber"]) {
      expect(section, needle).toContain(needle);
    }
  });
});
