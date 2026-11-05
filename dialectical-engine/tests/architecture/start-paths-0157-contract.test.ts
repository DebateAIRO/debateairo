import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { START_PATH_AUTHORS, START_PATHS_SOURCES, START_STEP_LIMITS, pathIdOf } from "../../packages/kernel/src/start-step-limits.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0157 (V4 start step, plan 2026-11-03 Task 19; spec §4): the paths a person chose at Start, sealed under the debate's own key. Readable columns
 * are codes only, so erasing the debate is shredding its key; the carry-on marks are ids and codes only. Expand: new objects only.
 */
const NAME = "0157_start_paths.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/start-paths-forward0157.json";
const PREVIOUS = "0156_pre_start_charge.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/pre-start-charge-forward0156.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLES = ["core.start_path_set", "core.start_path", "core.carry_on_mark"] as const;
const CARRIED = ["core.start_path_set", "core.start_path"] as const;
const DEFINERS = [
  "core.record_start_paths(uuid,jsonb,jsonb)", "core.read_start_paths(uuid)", "core.read_start_path_ids(uuid)",
  "core.record_carry_on_due(uuid)", "core.claim_carry_on_due(integer)", "core.read_carry_on_begun(integer)", "core.record_carry_on_done(uuid)"
] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string, table: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("\n);", at));
};
const listIn = (body: string, column: string): readonly string[] => {
  const match = new RegExp(`CHECK \\(${column} IN \\(([^)]*)\\)\\)`, "u").exec(body);
  return match === null ? [] : [...match[1]!.matchAll(/'([^']*)'/gu)].map((value) => value[1]!);
};

describe("0157: the chosen paths, sealed per run", () => {
  it("C-T is a step of the chain, after 0156, with its own loader and no amendment", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0157 } from './migration-forward0157.js';");
    expect(chain).toContain("loadForward0156,loadForward0157,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual([]);
    const loader = read("packages/db/src/migration-forward0157.ts");
    for (const name of [...TABLES, ...DEFINERS]) expect(loader, name).toContain(`"${name}"`);
    expect(loader).toContain("MIGRATION_FORWARD0157_");
  });

  it("C-M is bound to 0156's manifest and to the verifier in force", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "start-paths-forward0157-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
  });

  it("C-H says truthfully that it is expand and keeps the verifier: it creates exactly its seven definers and redefines nothing", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const sql = code(read(SQL_PATH));
    // So no function of 0132 (the content check), 0117, 0123 or 0040 is redefined here: they are called.
    expect([...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gmu)].map((match) => match[1])).toEqual(DEFINERS.map(nameOf));
    expect(sql).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
  });

  it("C-A passes the replay audit, and its three tables are new", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)].sort()).toEqual([...TABLES].sort());
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME);
    for (const table of TABLES) expect(earlier.some((name) => definedRelationNames(read(`migrations/${name}`)).includes(table)), table).toBe(false);
  });

  it("C-O: every table is guarded and read by definers only; the two content tables are sealed and bound to their key", () => {
    const sql = code(read(SQL_PATH));
    for (const table of TABLES) {
      expect(tableBody(sql, table), table).not.toBe("");
      expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\nFOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
      expect(sql).toMatch(new RegExp(`^REVOKE ALL ON ${table.replace(".", "\\.")} FROM PUBLIC,`, "mu"));
      expect(sql).not.toMatch(new RegExp(`^GRANT [^\\n]* ON ${table.replace(".", "\\.")} TO`, "mu"));
    }
    expect(sql).toContain("CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON core.start_path_set\nFOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('run_id');");
    expect(sql).toContain("CREATE TRIGGER aaa_enforce_web_evidence_content BEFORE INSERT ON core.start_path\nFOR EACH ROW EXECUTE FUNCTION identity.enforce_web_evidence_content('path_id');");
    expect(sql).not.toContain("REFERENCES core.run");
    for (const table of CARRIED) expect(CONTENT_CARRIERS as readonly string[], table).toContain(table);
    expect(CONTENT_CARRIERS as readonly string[]).not.toContain("core.carry_on_mark");
    expect(tableBody(sql, "core.carry_on_mark")).not.toMatch(/ciphertext|attestation|content/u);
  });

  it("C-K: codes only, the contract's lists, and the path numbering", () => {
    const sql = code(read(SQL_PATH));
    const set = tableBody(sql, "core.start_path_set");
    const path = tableBody(sql, "core.start_path");
    const mark = tableBody(sql, "core.carry_on_mark");
    expect(listIn(set, "source")).toEqual([...START_PATHS_SOURCES]);
    expect(listIn(path, "author")).toEqual([...START_PATH_AUTHORS]);
    expect(listIn(set, "chosen_by")).toEqual(["PERSON", "AIS"]);
    expect(listIn(mark, "mark")).toEqual(["DUE", "BEGUN", "DONE"]);
    expect(mark).toContain("PRIMARY KEY (run_id, mark)");
    expect(path).toContain("PRIMARY KEY (run_id, path_id)");
    expect(path).toContain("UNIQUE (run_id, path_no)");
    expect(path).toContain("CHECK (path_id = 'b' || path_no::text)");
    expect(path).toContain("CHECK (author <> 'PERSON_OWN_VIEW' OR has_own_words)");
    const pattern = /CHECK \(path_id ~ '([^']+)'\)/u.exec(path)?.[1];
    expect(pattern).toBe("^b[1-8]$");
    const id = new RegExp(pattern!, "u");
    for (let no = 1; no <= 8; no += 1) expect(id.test(pathIdOf(no)), pathIdOf(no)).toBe(true);
    for (const refused of ["b0", "b9", "B1", "a1", "b1 ", "kp01"]) expect(id.test(refused), refused).toBe(false);
    // The readable text columns are codes: no question, list, path or own words in plain text anywhere.
    const textColumns = [set, path, mark].flatMap((body) => [...body.matchAll(/^ {2}([a-z_]+) text\b/gmu)].map((match) => match[1]!)).sort();
    expect(textColumns).toEqual(["author", "chosen_by", "mark", "path_id", "source"]);
  });

  it("C-S: a path holds a merged group of any size: 0..54 members in the table and in the writer, and a sealed path up to 256 KiB", () => {
    // Task 92b (4 Nov night): the merges keep every suggestion the AI put in a group, so a path holds up to the 54 suggestions one merge
    // can be given; 0157 was edited in place before its first release. 262,144 is the limit 0158 sets for a gap round's content.
    const whole = read(SQL_PATH);
    const sql = code(whole);
    const path = tableBody(sql, "core.start_path");
    expect(path).toContain("start_path_viewpoint_count_check CHECK (viewpoint_count BETWEEN 0 AND 54)");
    expect(path).toContain("start_path_content_size CHECK (octet_length(content_ciphertext::text) <= 262144)");
    const at = sql.indexOf("CREATE OR REPLACE FUNCTION core.record_start_paths(");
    const writer = sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
    expect(writer).toContain("(path.value->>'viewpoint_count') !~ '^([0-9]|[1-4][0-9]|5[0-4])$'");
    for (const old of ["BETWEEN 0 AND 4", "<= 65536", "'^[0-4]$'"]) expect(whole, old).not.toContain(old);
    // The writer's pattern takes every count a merge can make, written as JSON writes a number, and nothing else.
    const pattern = new RegExp(/\(path\.value->>'viewpoint_count'\) !~ '([^']+)'/u.exec(writer)![1]!, "u");
    for (let count = 0; count <= START_STEP_LIMITS.viewpointsMax; count += 1) expect(pattern.test(String(count)), String(count)).toBe(true);
    for (const refused of [String(START_STEP_LIMITS.viewpointsMax + 1), "60", "99", "100", "054", "00", "-1", "4.0", "1e1", " 5"]) {
      expect(pattern.test(refused), refused).toBe(false);
    }
  });

  it("C-G: seven EXECUTE grants to the runtime only, and no new core function is left to PUBLIC (the content-provision boot count)", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/^GRANT ([^\n]+);$/gmu)].map((match) => match[1])).toEqual(DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature} TO debateai_runtime`));
    // Whole-file, not line by line: a GRANT split over two lines, indented or inside a DO block counts too.
    expect(sql.match(/\bGRANT\b/giu)).toHaveLength(7);
    for (const signature of DEFINERS) {
      expect(sql, signature).toMatch(new RegExp(`^REVOKE ALL ON FUNCTION ${signature.replace(/[.()]/gu, "\\$&")} FROM PUBLIC,`, "mu"));
    }
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH))
      .toEqual([{ roleName: "debateai_runtime", source: SQL_PATH, grants: DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature}`) }]);
  });

  it("C-B: a debate whose owner went away never holds a slot of the BEGUN page, and the claim closes it", () => {
    const sql = code(read(SQL_PATH));
    const bodyOf = (name: string): string => {
      const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
      return sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
    };
    // The page is taken after the live-owner rule, so dead debates cannot crowd out live ones.
    const begun = bodyOf("core.read_carry_on_begun");
    expect(begun.indexOf("identity_user.state = 'active'")).toBeGreaterThan(-1);
    expect(begun.indexOf("LIMIT p_limit")).toBeGreaterThan(begun.indexOf("identity_user.state = 'active'"));
    // The claim (it may write) marks DONE, a bounded number per call, every BEGUN debate whose owner or binding is gone.
    const claim = bodyOf("core.claim_carry_on_due");
    expect(claim).toContain("SELECT stale.run_id, 'DONE'");
    expect(claim.indexOf("LIMIT p_limit")).toBeGreaterThan(claim.indexOf("SELECT stale.run_id, 'DONE'"));
  });

  it("C-C: the carry-on claim waits for an undecided Free publication, at most six hours from DUE", () => {
    const sql = code(read(SQL_PATH));
    const at = sql.indexOf("CREATE OR REPLACE FUNCTION core.claim_carry_on_due(");
    const body = sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
    for (const needle of ["identity.free_public_ask", "outcome IS NULL", "interval '6 hours'", "ON CONFLICT DO NOTHING", "CARRY_ON_LIMIT_INVALID"]) {
      expect(body, needle).toContain(needle);
    }
  });

  it("C-R is documented and listed", () => {
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain("packages/db/src/migration-forward0157.ts");
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0157, below) the forty-seventh", "## The chosen paths, sealed per run (0157)", "`loadForward0157`", "MIGRATION_FORWARD0157_", "-- n1: expand", "-- n1: keeps-verifier"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0157_start_paths.sql` (after `0156_pre_start_charge.sql`, `n1: expand`)");
  });
});
