import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { TRUST_WORDS } from "../../packages/contract/src/web.js";
import { RUN_PATH_STEPS } from "../../packages/contract/src/run-paths.js";
import { pathIdOf } from "../../packages/kernel/src/start-step-limits.js";
import { PATH_POINT_MARKS, PATH_STEPS } from "../../packages/db/src/path-progress.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0161 (V4 start step, plan 2026-11-03 Task 53a; spec §2 item 7, §4.6; items wait-d1, chat-first-round, journey-f1, wait-f16, public-f25):
 * each path's step and each point's marks, written by the runner as the work moves on, ids and codes only (nothing sealed, no carrier), and
 * two small reads: how far a debate's carry-on has gone (0159's marks) and how many reports a public debate has that did not fail, the
 * owner's own and everyone's (0147's reports; owner answer Q20: B). Tables and guards on 0117's model, access on 0160's: definers only, no
 * role reads a table. Expand: new objects only.
 */
const NAME = "0161_path_progress.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/path-progress-forward0161.json";
const PREVIOUS = "0160_path_results.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/path-results-forward0160.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
/** Every regular-expression metacharacter escaped, the backslash included (CodeQL js/incomplete-sanitization). */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLES = ["core.path_step", "core.path_point_mark"] as const;
const RUNTIME_DEFINERS = [
  "core.record_path_step(uuid,text,text)", "core.record_path_point_mark(uuid,text,uuid,text,text)", "core.read_path_progress(uuid)",
  "core.read_carry_on_mark(uuid)"
] as const;
const BILLING_DEFINERS = ["identity.count_public_reports(uuid,uuid)"] as const;
const DEFINERS = [...RUNTIME_DEFINERS, ...BILLING_DEFINERS] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string, table: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("\n);", at));
};
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
};
const listIn = (body: string, column: string): readonly string[] => {
  const match = new RegExp(`CHECK \\(${column} IN \\(([^)]*)\\)\\)`, "u").exec(body);
  return match === null ? [] : [...match[1]!.matchAll(/'([^']*)'/gu)].map((value) => value[1]!);
};
const definedFunctions = (sql: string): readonly string[] =>
  [...code(sql).matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_0-9.]+)\(/gmu)].map((match) => match[1]!);

describe("0161: each path's step and points, the carry-on mark and the public report counts", () => {
  it("C-T is a step of the chain, after 0160, with its own loader and no amendment", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0161 } from './migration-forward0161.js';");
    expect(chain).toContain("loadForward0160,loadForward0161,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual([]);
    const loader = read("packages/db/src/migration-forward0161.ts");
    for (const name of [...TABLES, ...DEFINERS]) expect(loader, name).toContain(`"${name}"`);
    expect(loader).toContain('const VERSION = "path-progress-forward0161-v1";');
    expect(loader).toContain('const PREVIOUS = "0160_path_results.sql";');
    expect(loader).toContain("MIGRATION_FORWARD0161_");
  });

  it("C-M is bound to 0160's manifest and to the verifier in force", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "path-progress-forward0161-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
  });

  it("C-H says truthfully that it is expand and keeps the verifier: it creates exactly its five definers and redefines nothing of 0147 or 0159", () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: expand$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    // No guard function of its own: nothing here is sealed, so the truncate guard, 0000's reject_mutation and 0040's erasure barrier are called.
    expect(definedFunctions(sql)).toEqual(DEFINERS.map(nameOf));
    for (const earlier of ["0147_public_tree.sql", "0159_start_paths.sql"]) {
      const theirs = definedFunctions(read(`migrations/${earlier}`));
      expect(theirs.length, earlier).toBeGreaterThan(0);
      for (const name of definedFunctions(sql)) expect(theirs, `${earlier} ${name}`).not.toContain(name);
    }
    expect(code(sql)).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
    // Every definer runs as its owner with nothing but pg_catalog on its path.
    for (const signature of DEFINERS) {
      const body = bodyOf(code(sql), nameOf(signature));
      expect(body, signature).not.toBe("");
      expect(body, signature).toMatch(/\n\s*SECURITY DEFINER\n/u);
      expect(body, signature).toMatch(/\n\s*SET search_path ?= ?pg_catalog\n/u);
    }
    for (const reader of ["core.read_path_progress", "core.read_carry_on_mark", "identity.count_public_reports"]) {
      expect(bodyOf(code(sql), reader), reader).toMatch(/\n\s*STABLE\n/u);
    }
  });

  it("C-A passes the replay audit, and its two tables are new", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)].sort()).toEqual([...TABLES].sort());
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME);
    for (const table of TABLES) expect(earlier.some((name) => definedRelationNames(read(`migrations/${name}`)).includes(table)), table).toBe(false);
  });

  it("C-O: both tables are append-only, guarded against erasure, never carriers and read by definers only", () => {
    const sql = code(read(SQL_PATH));
    for (const table of TABLES) {
      expect(tableBody(sql, table), table).not.toBe("");
      expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\nFOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
      expect(sql).toContain(`CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();`);
      expect(sql).toMatch(new RegExp(`^REVOKE ALL ON ${table.replace(".", "\\.")} FROM PUBLIC,debateai_runtime,debateai_billing_runtime,`, "mu"));
      expect(sql).not.toMatch(new RegExp(`^GRANT [^\\n]* ON ${table.replace(".", "\\.")} TO`, "mu"));
      // Ids and codes only: no carrier, nothing sealed.
      expect(CONTENT_CARRIERS as readonly string[], table).not.toContain(table);
      expect(tableBody(sql, table), table).not.toMatch(/ciphertext|attestation|content/u);
      expect(tableBody(sql, table), table).toContain("REFERENCES core.start_path_set(run_id)");
    }
    expect(sql).not.toMatch(/\bGRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/iu);
    for (const name of ["core.record_path_step", "core.record_path_point_mark", "core.read_path_progress"]) {
      expect(bodyOf(sql, name), name).toContain("core.run_private_content_is_live");
    }
  });

  it("C-K: the path ids, the runner's steps and marks, the contract's four trust words and FOUND with its trust word", () => {
    const sql = code(read(SQL_PATH));
    const step = tableBody(sql, "core.path_step");
    const mark = tableBody(sql, "core.path_point_mark");
    const patterns = [step, mark].map((body) => /CHECK \(path_id ~ '([^']+)'\)/u.exec(body)?.[1]);
    expect(patterns).toEqual(["^b[1-8]$", "^b[1-8]$"]);
    const id = new RegExp(patterns[0]!, "u");
    for (let no = 1; no <= 8; no += 1) expect(id.test(pathIdOf(no)), pathIdOf(no)).toBe(true);
    for (const refused of ["b0", "b9", "B1", "a1", "b1 ", "kp01"]) expect(id.test(refused), refused).toBe(false);
    expect(listIn(step, "step")).toEqual([...PATH_STEPS]);
    expect([...PATH_STEPS]).toEqual([...RUN_PATH_STEPS]);
    expect(listIn(mark, "mark")).toEqual([...PATH_POINT_MARKS]);
    const trust = /CHECK \(trust IS NULL OR trust IN \(([^)]*)\)\)/u.exec(mark)?.[1];
    expect([...(trust ?? "").matchAll(/'([^']*)'/gu)].map((value) => value[1])).toEqual([...TRUST_WORDS]);
    expect(mark).toContain("CHECK ((mark = 'FOUND') = (trust IS NOT NULL))");
    expect(step).toContain("PRIMARY KEY (run_id, path_id, step)");
    expect(step).toContain("recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()");
    expect(mark).toContain("PRIMARY KEY (run_id, node_id, mark)");
    expect(mark).toContain("node_id uuid NOT NULL");
    expect(mark).toContain("FOREIGN KEY (run_id, node_id) REFERENCES core.node(run_id, node_id)");
    expect(mark).toContain("recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()");
    const textColumns = [step, mark].flatMap((body) => [...body.matchAll(/^ {2}([a-z_]+) text\b/gmu)].map((match) => match[1]!)).sort();
    expect(textColumns).toEqual(["mark", "path_id", "path_id", "step", "trust"]);
  });

  it("C-W: the writers check the run's own paths and nodes, keep the first row and answer RUN_ERASED; the reads are the brief's", () => {
    const sql = code(read(SQL_PATH));
    for (const name of ["core.record_path_step", "core.record_path_point_mark"]) {
      const body = bodyOf(sql, name);
      for (const needle of ["'PATH_PROGRESS_INVALID'", "core.start_path AS path", "ON CONFLICT", "DO NOTHING", "'RECORDED'", "'ALREADY'", "'RUN_ERASED'"]) {
        expect(body, `${name} ${needle}`).toContain(needle);
      }
    }
    expect(bodyOf(sql, "core.record_path_point_mark")).toContain("core.node AS node");
    const progress = bodyOf(sql, "core.read_path_progress");
    for (const needle of ["'steps'", "'marks'", "'path_id'", "'step'", "'node_id'", "'mark'", "'trust'", "'recorded_at'", "RETURN NULL"]) {
      expect(progress, needle).toContain(needle);
    }
    const carryOn = bodyOf(sql, "core.read_carry_on_mark");
    for (const needle of ["core.carry_on_mark", "'NONE'", "'DUE'", "'BEGUN'", "'DONE'"]) expect(carryOn, needle).toContain(needle);
    const counts = bodyOf(sql, "identity.count_public_reports");
    for (const needle of ["identity.public_report", "outcome IS DISTINCT FROM 'FAILED'", "writer_ref = p_owner_ref", "'own'", "'all'"]) {
      expect(counts, needle).toContain(needle);
    }
    // A version still being written counts only as 0147 counts one (its carrier lives and its copy is sealed): a press left unwritten is no report.
    expect(counts.replace(/\s+/gu, " ")).toContain("(report.outcome IS NOT NULL OR (identity.web_evidence_run_owner(report.carrier_run_id) IS NOT NULL"
      + " AND EXISTS (SELECT 1 FROM identity.public_material AS material WHERE material.material_id = report.report_id)))");
  });

  it("C-G: five EXECUTE grants, four to the runtime and one to the API's billing role, and no new function is left to PUBLIC", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/^GRANT ([^\n]+);$/gmu)].map((match) => match[1])).toEqual([
      ...RUNTIME_DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature} TO debateai_runtime`),
      ...BILLING_DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature} TO debateai_billing_runtime`)
    ]);
    // Whole-file, not line by line: a GRANT split over two lines, indented or inside a DO block counts too.
    expect(sql.match(/\bGRANT\b/giu)).toHaveLength(5);
    expect(sql.match(/\bGRANT EXECUTE\b/giu)).toHaveLength(5);
    expect(sql.match(/ TO debateai_runtime;$/gmu)).toHaveLength(4);
    expect(sql.match(/ TO debateai_billing_runtime;$/gmu)).toHaveLength(1);
    for (const signature of DEFINERS) {
      expect(sql, signature).toMatch(new RegExp(`^REVOKE ALL ON FUNCTION ${escapeRegExp(signature)} FROM PUBLIC,`, "mu"));
    }
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)).toEqual([
      { roleName: "debateai_runtime", source: SQL_PATH, grants: RUNTIME_DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature}`) },
      { roleName: "debateai_billing_runtime", source: SQL_PATH, grants: BILLING_DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature}`) }
    ]);
  });

  it("C-R is documented and listed", () => {
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of ["packages/db/src/migration-forward0161.ts", "packages/db/src/path-progress.ts"]) expect(corpus, path).toContain(path);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0161, below) the fifty-first", "## The path progress per run (0161)", "`loadForward0161`", "MIGRATION_FORWARD0161_"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0161_path_progress.sql` (after `0160_path_results.sql`, `n1: expand`)");
    // The repository reads the contract's types only.
    const repository = read("packages/db/src/path-progress.ts");
    expect(repository).toMatch(/^import type \{[^}]+\} from "@debateai\/contract";$/mu);
    expect(repository).not.toMatch(/^import \{[^}]+\} from "@debateai\/contract";$/mu);
    expect(read("packages/db/src/index.ts")).toContain('export * from "./path-progress.js";');
  });
});
