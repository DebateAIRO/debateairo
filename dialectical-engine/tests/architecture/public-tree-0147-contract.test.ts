import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationN1Compatibility, auditMigrationReplaySafety, definedFunctionNames, definedRelationNames, type N1AuditContext } from "../../tools/orphan-audit/src/index.js";

/**
 * 0147 and 0148 (plan 2026-10-31-r22-owner-changes decisions 13, 21 and 22): the public tree on the publication, and an erased account keeping its public debates.
 * These read the migration's text and the plan: who may call each definer, that no role reads a table, the guards, the n1 lines. What the definers do on real
 * PostgreSQL is tests/integration/public-tree-flow.test.ts's.
 */
const NAME = "0147_public_tree.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-tree-forward0147.json";
const PREVIOUS = "0145_web_researched_unsettled.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/web-researched-unsettled-forward0145.json";
const NEXT = "0148_erasure_keeps_public.sql";
const NEXT_SQL_PATH = `migrations/${NEXT}`;
const NEXT_MANIFEST_PATH = "migrations/lineage/erasure-keeps-public-forward0148.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));

const RUNTIME = "debateai_runtime";
const BILLING = "debateai_billing_runtime";
const ERASURE = "debateai_erasure_runtime";
const EXPORT = "debateai_data_export_worker";
/** Every role a 0131-to-0145 step takes care to refuse by name, beside PUBLIC. */
const ROLES = [RUNTIME, BILLING, "debateai_authorization_runtime", ERASURE, "debateai_replay", EXPORT] as const;

const TABLES = ["identity.public_material", "identity.public_dig_input", "identity.public_contribution_check", "identity.public_climb_done",
  "identity.public_answer_update", "identity.public_report", "identity.public_debate_report", "identity.public_page_skip"] as const;
/** The one role that may call each definer: the API's starts on the billing runtime, the runner's on its own, deleting and exporting on theirs. */
const GRANTED: Readonly<Record<string, string>> = {
  "identity.read_public_dig_parent(uuid,uuid)": BILLING,
  "identity.join_public_tree(uuid,uuid,uuid,uuid,text)": BILLING,
  "identity.record_public_material(uuid,uuid,uuid,text,jsonb,bytea)": BILLING,
  "identity.open_public_report(uuid,uuid,uuid,boolean)": BILLING,
  "identity.read_public_tree_of_run(uuid)": BILLING,
  "identity.read_public_material(uuid)": RUNTIME,
  "identity.record_public_dig_input(uuid,text,jsonb,bytea)": RUNTIME,
  "identity.read_public_dig_input(uuid)": RUNTIME,
  "identity.take_public_path_turn(uuid,uuid,uuid,text,text,smallint,text,uuid)": RUNTIME,
  "identity.record_public_path_update(uuid,text,uuid,text,text,boolean,text,text,jsonb,jsonb,smallint,jsonb,jsonb,bytea)": RUNTIME,
  "identity.read_public_path_line(uuid)": RUNTIME,
  "identity.read_public_climb_next(uuid)": RUNTIME,
  "identity.record_public_check_passed(uuid,uuid)": RUNTIME,
  "identity.read_public_digs_unsettled(timestamptz,integer)": RUNTIME,
  "identity.read_public_climbs_owed(integer)": RUNTIME,
  "identity.mark_public_climb_done(uuid)": RUNTIME,
  "identity.read_public_answer_updates(uuid)": RUNTIME,
  "identity.record_public_answer_update(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb,jsonb,smallint,jsonb,bigint,jsonb,bytea)": RUNTIME,
  "identity.read_public_reports_unwritten(integer)": RUNTIME,
  "identity.record_public_report(uuid,text,text,text,text,smallint,integer,smallint,smallint,jsonb,jsonb,jsonb,bigint,jsonb,bytea)": RUNTIME,
  "identity.read_public_report_charged_until(uuid)": RUNTIME,
  "identity.read_public_checks_passed(integer)": RUNTIME,
  "identity.read_public_page_owed(integer)": RUNTIME,
  "identity.read_public_reports_owed(integer)": RUNTIME,
  "identity.record_public_debate_report(uuid,integer,uuid,jsonb)": RUNTIME,
  "identity.read_public_debate_reports(uuid)": RUNTIME,
  "identity.record_public_page_skip(uuid,uuid,text,text)": RUNTIME,
  "identity.read_free_debate_owner(uuid)": RUNTIME,
  "identity.forget_erased_debate_public_tree(uuid)": ERASURE,
  "identity.read_data_export_public_tree(uuid,uuid)": EXPORT
};
/** Called only from inside the file: its trigger function and its "nothing ongoing" (the second is not a definer). */
const NOT_GRANTED = ["identity.guard_public_tree_record()", "identity.public_tree_ongoing(uuid)"] as const;
/** The tables holding sealed text, each checked by 0132's trigger on insert, but a report: its text arrives on UPDATE, checked by its own definer. */
const CHECKED_ON_INSERT = ["identity.public_material", "identity.public_dig_input", "identity.public_answer_update"] as const;
const CARRIERS = [...CHECKED_ON_INSERT, "identity.public_report"] as const;

const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  return sql.slice(at, sql.indexOf("\n$$;", at));
};

describe("0147: the public tree", () => {
  it("C-T follows 0145 in the chain's STEPS (0146 is another lane's), with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0147 } from './migration-forward0147.js';");
    expect(chain).toContain("loadForward0145,loadForward0147,loadForward0148");
    const loader = read("packages/db/src/migration-forward0147.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-tree-forward0147-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-tree-forward0147.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0147_");
    expect(loader).toContain("export async function loadForward0147(");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of [...NOT_GRANTED, ...Object.keys(GRANTED)]) expect(loader, signature).toContain(`"${signature}"`);
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 2)).toEqual([PREVIOUS, NAME, NEXT]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0145's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "public-tree-forward0147-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
  });

  it("C-H declares `-- n1: expand` and `-- n1: keeps-verifier` in its header", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({
      expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
  });

  it("C-A passes the N-1 audit and the replay audit, and redefines nothing an earlier step made", async () => {
    const sql = read(SQL_PATH);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME)) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    for (const signature of [...NOT_GRANTED, ...Object.keys(GRANTED)]) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    // The only ALTER is the owner loop's, over this file's own new names.
    expect(code(sql).match(/\bALTER (?:TABLE|FUNCTION)\b[^\n]*/gu)).toEqual(["ALTER TABLE %s OWNER TO %I', v_name, v_owner);", "ALTER FUNCTION %s OWNER TO %I', v_name, v_owner);"]);
  });

  it("C-O makes exactly the eight tables, each guarded, each refused to every role, and keeps no text in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      const revoke = new RegExp(`^REVOKE ALL ON ${table.replace(".", "\\.")} FROM ([^;\\n]+);$`, "mu").exec(sql);
      expect(revoke?.[1]?.split(","), table).toEqual(["PUBLIC", ...ROLES]);
      const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      const columns = sql.slice(at, sql.indexOf("\n);", at));
      expect(columns, table).not.toMatch(/\b(?:text|question|answer|quote|summary|line|reason|name)\s+text\b/u);
    }
    // No role reads a table: execute on definers is the only thing this file grants.
    const grants = [...sql.matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)];
    expect(grants.length).toBe(Object.keys(GRANTED).length);
    for (const grant of grants) expect(grant[1]).toMatch(/^EXECUTE ON FUNCTION identity\./u);
    expect(sql).not.toMatch(/\bGRANT\b[^\n]*\bON (?:TABLE )?identity\.public_/mu);
  });

  it("C-G each definer is callable by its one role and refused to every other", () => {
    const sql = code(read(SQL_PATH));
    const definers = [...sql.matchAll(/^CREATE OR REPLACE FUNCTION (identity\.[a-z_]+)\(/gmu)].map((match) => match[1]!);
    expect(definers.sort()).toEqual([...NOT_GRANTED, ...Object.keys(GRANTED)].map(nameOf).sort());
    for (const name of definers) {
      const head = bodyOf(sql, name).split("\nAS $$")[0]!;
      // "Nothing ongoing" runs as the definer that called it: it is no way in, and every role is refused it below.
      if (name === "identity.public_tree_ongoing") expect(head).not.toContain("SECURITY DEFINER");
      else expect(head, name).toContain("SECURITY DEFINER");
      expect(head, name).toContain("SET search_path=pg_catalog");
    }
    const granted = [...sql.matchAll(/^GRANT EXECUTE ON FUNCTION (\S+) TO ([a-z_]+);$/gmu)].map((match) => [match[1], match[2]]);
    expect(Object.fromEntries(granted)).toEqual(GRANTED);
    for (const [signature, role] of Object.entries(GRANTED)) {
      const revoke = new RegExp(`^REVOKE ALL ON FUNCTION ${signature.replace(/[.()]/gu, "\\$&")} FROM ([^;\\n]+);$`, "mu").exec(sql);
      expect(revoke?.[1]?.split(",").sort(), signature).toEqual(["PUBLIC", ...ROLES.filter((other) => other !== role)].sort());
    }
    expect(sql).toMatch(/^REVOKE ALL ON FUNCTION identity\.guard_public_tree_record\(\) FROM PUBLIC;$/mu);
    expect(new RegExp(`^REVOKE ALL ON FUNCTION identity\\.public_tree_ongoing\\(uuid\\) FROM PUBLIC,${ROLES.join(",")};$`, "mu").test(sql)).toBe(true);
  });

  it("C-S the guards exist: sealed text is checked on the way in, and the records stay as written", () => {
    const sql = code(read(SQL_PATH));
    for (const table of CHECKED_ON_INSERT) {
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON ${table.replace(".", "\\.")}\\nFOR EACH ROW EXECUTE FUNCTION identity\\.enforce_web_evidence_content\\('[a-z_]+'\\);`, "u"));
    }
    for (const carrier of CARRIERS) expect(CONTENT_CARRIERS as readonly string[], carrier).toContain(carrier);
    // A report's text comes on UPDATE, past that trigger: its own definer proves the envelope, the live key and the attestation under its carrier.
    const record = bodyOf(sql, "identity.record_public_report");
    expect(record).toContain("core.is_content_envelope(p_content)");
    expect(record).toContain("core.run_private_content_is_live(v_row.carrier_run_id)");
    expect(record).toContain("'identity.public_report'");
    // Append-only: six tables through the guard, the page's two through core.reject_mutation.
    for (const table of TABLES.slice(0, 6)) {
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER guard_public_tree_record BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}\\nFOR EACH ROW EXECUTE FUNCTION identity\\.guard_public_tree_record\\(\\);`, "u"));
    }
    for (const table of TABLES.slice(6)) {
      expect(sql, table).toMatch(new RegExp(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table.replace(".", "\\.")}\\nFOR EACH STATEMENT EXECUTE FUNCTION core\\.reject_mutation\\(\\);`, "u"));
    }
    const guard = bodyOf(sql, "identity.guard_public_tree_record");
    expect(guard).toContain("MESSAGE='PUBLIC_TREE_APPEND_ONLY'");
    // A report is never deleted, by the forget definer or a deleted account: its row stays with no name, and its copy keeps the page.
    expect(guard).toContain("TG_TABLE_NAME <> 'public_report'");
    expect(sql).toMatch(/writer_ref uuid REFERENCES identity\."user"\(owner_ref\) ON DELETE SET NULL/u);
    // The page's copy is under the publication's key, and only that.
    expect(sql).toContain("content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'");
    // A report opens only while nothing is ongoing, and on a debate that is still public.
    const open = bodyOf(sql, "identity.open_public_report");
    expect(open).toContain("core.run_is_published(v_root, p_publication_ref)");
    expect(open).toContain("identity.public_tree_ongoing(p_publication_ref)");
  });

  it("C-E the erasure role and the export worker reach their functions, and forgetting asks for an erased debate", () => {
    expect(read("packages/db/src/erasure-page-memory.ts")).toContain('"SELECT identity.forget_erased_debate_public_tree($1)"');
    expect(read("packages/db/src/data-export.ts")).toContain('"identity.read_data_export_public_tree(uuid,uuid)",');
    const forget = bodyOf(code(read(SQL_PATH)), "identity.forget_erased_debate_public_tree");
    expect(forget).toContain("serve.private_run_erasure_tombstone");
    expect(forget).toContain("MESSAGE='PUBLIC_DEBATE_NOT_ERASED'");
    for (const table of TABLES.slice(0, 5)) expect(forget, table).toContain(`DELETE FROM ${table} `);
    for (const kept of TABLES.slice(5)) expect(forget, kept).not.toContain(`DELETE FROM ${kept} `);
  });

  it("C-P discloses its grants and lists its files", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const actual = Object.entries(GRANTED).map(([signature, role]) => `${role}: EXECUTE ON FUNCTION ${signature}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(declared).toEqual(actual);
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const file of ["packages/db/src/migration-forward0147.ts", "packages/db/src/migration-forward0148.ts", "packages/db/src/public-tree.ts",
      "apps/api/src/public-tree.ts", "apps/runner/src/public-contribution.ts", "apps/runner/src/public-tree-sources.ts",
      "packages/judgement/src/public-contribution-prompt.ts"]) expect(corpus, file).toContain(file);
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/public-tree-flow.test.ts");
  });

  it("C-R is documented as the thirty-sixth step, and the deploy notes name it", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0147, below) the thirty-sixth");
    const heading = "## The public tree (0147)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["thirty-sixth", NAME, "public-tree-forward0147.json", "packages/db/src/migration-forward0147.ts",
      "`loadForward0147`", "MIGRATION_FORWARD0147_", "-- n1: expand", "-- n1: keeps-verifier"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0147_public_tree.sql` (after `0145_web_researched_unsettled.sql`, `n1: expand`)");
  });
});

describe("0148: an erased account keeps its public debates", () => {
  it("is drained, keeps the verifier, follows 0147, is the chain's head for now, and pins its own bytes", async () => {
    expect(parseN1Header(NEXT, read(NEXT_SQL_PATH))).toEqual({
      expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null
    });
    const manifest = JSON.parse(read(NEXT_MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "erasure-keeps-public-forward0148-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: NAME, manifestSha256: sha256(read(MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NEXT, sha256: sha256(read(NEXT_SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.find((step) => step.name === NEXT)?.previousName).toBe(NAME);
    expect(read("packages/db/src/migration-forward-chain.ts")).toContain("import { loadForward0148 } from './migration-forward0148.js';");
    expect(read("packages/db/src/migration-forward0148.ts")).toContain("export async function loadForward0148(");
  });

  it("changes rows only: a stored true that has not started is cleared, and one past prepare refuses the step", () => {
    const sql = code(read(NEXT_SQL_PATH));
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE|DELETE|TRUNCATE)\b/u);
    expect(sql.match(/\bUPDATE\b/gu)).toHaveLength(1);
    expect(sql).toMatch(/UPDATE identity\.account_erasure_request SET delete_public_debates = false\nWHERE delete_public_debates AND prepared_at IS NULL AND cancelled_at IS NULL AND committed_at IS NULL;/u);
    expect(sql).toMatch(/request\.delete_public_debates AND request\.prepared_at IS NOT NULL AND request\.committed_at IS NULL AND request\.cancelled_at IS NULL/u);
    expect(sql).toContain("MESSAGE='ERASURE_WITH_PUBLIC_REMOVAL_IN_FLIGHT'");
  });

  it("is documented as the thirty-seventh step, drained, and the deploy notes name it", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0148, below) the thirty-seventh");
    const heading = "## An erased account keeps its public debates (0148)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["thirty-seventh", NEXT, "erasure-keeps-public-forward0148.json", "`loadForward0148`", "-- n1: drained", "-- n1: keeps-verifier"]) {
      expect(section, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0148_erasure_keeps_public.sql` (after `0147_public_tree.sql`, `n1: drained`)");
  });
});
