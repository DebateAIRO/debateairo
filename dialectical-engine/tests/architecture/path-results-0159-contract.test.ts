import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTENT_CARRIERS } from "../../packages/crypto/src/index.js";
import { PATH_OUTCOME_STATES } from "../../packages/contract/src/path-outcome.js";
import { pathIdOf } from "../../packages/kernel/src/start-step-limits.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { auditMigrationReplaySafety, definedRelationNames } from "../../tools/orphan-audit/src/index.js";

/**
 * 0159 (V4 start step, plan 2026-11-03 Task 21; spec §2.7, §4.3): a path debate's results per path. Which root argued each chosen path (and
 * where it moved after a reclaim), each path's answer so far and the gap round, the last two sealed under the debate's own key. Tables and
 * guards on 0117's model with this file's own guard functions; access on 0158's: definers only, no role reads a table. Expand: new objects only.
 */
const NAME = "0159_path_results.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/path-results-forward0159.json";
const PREVIOUS = "0158_start_paths.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/start-paths-forward0158.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLES = ["core.path_root", "core.path_root_repoint", "core.path_outcome", "core.path_gap_round"] as const;
const CARRIED = ["core.path_outcome", "core.path_gap_round"] as const;
const GUARDS = [
  "core.enforce_content_ciphertext_path_outcome", "core.enforce_content_attestation_v2_path_outcome",
  "core.enforce_content_ciphertext_path_gap_round", "core.enforce_content_attestation_v2_path_gap_round"
] as const;
const DEFINERS = [
  "core.write_path_root(uuid,text,integer,uuid,text)", "core.record_path_outcome(uuid,text,text,jsonb,bytea)",
  "core.record_path_gap_round(uuid,integer,jsonb,bytea)", "core.read_path_roots(uuid)", "core.read_path_outcomes(uuid)",
  "core.read_path_gap_round(uuid)"
] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string, table: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("\n);", at));
};
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
};

describe("0159: a path debate's results per path", () => {
  it("C-T is a step of the chain, after 0158, with its own loader and no amendment", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0159 } from './migration-forward0159.js';");
    expect(chain).toContain("loadForward0158,loadForward0159,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual([]);
    const loader = read("packages/db/src/migration-forward0159.ts");
    for (const name of [...TABLES, ...DEFINERS]) expect(loader, name).toContain(`"${name}"`);
    expect(loader).toContain("MIGRATION_FORWARD0159_");
  });

  it("C-M is bound to 0158's manifest and to the verifier in force", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "path-results-forward0159-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
  });

  it("C-H says truthfully that it is expand and keeps the verifier: it creates its four own guards and six definers and redefines nothing", () => {
    expect(parseN1Header(NAME, read(SQL_PATH))).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    const sql = code(read(SQL_PATH));
    // So no function of 0117, 0119, 0040 or 0000 is redefined here: they are called.
    expect([...sql.matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_0-9.]+)\(/gmu)].map((match) => match[1])).toEqual([...GUARDS, ...DEFINERS.map(nameOf)]);
    expect(sql).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
  });

  it("C-A passes the replay audit, and its four tables are new", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    expect([...definedRelationNames(sql)].sort()).toEqual([...TABLES].sort());
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME);
    for (const table of TABLES) expect(earlier.some((name) => definedRelationNames(read(`migrations/${name}`)).includes(table)), table).toBe(false);
  });

  it("C-O: every table is append-only, guarded against erasure and read by definers only; the two content tables are sealed and bound to their key", () => {
    const sql = code(read(SQL_PATH));
    for (const table of TABLES) {
      expect(tableBody(sql, table), table).not.toBe("");
      expect(sql).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql).toContain(`CREATE TRIGGER reject_mutation BEFORE UPDATE OR DELETE ON ${table}\nFOR EACH STATEMENT EXECUTE FUNCTION core.reject_mutation();`);
      expect(sql).toContain(`CREATE TRIGGER enforce_erasure_barrier BEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_erasure_barrier();`);
      expect(sql).toMatch(new RegExp(`^REVOKE ALL ON ${table.replace(".", "\\.")} FROM PUBLIC,`, "mu"));
      expect(sql).not.toMatch(new RegExp(`^GRANT [^\\n]* ON ${table.replace(".", "\\.")} TO`, "mu"));
    }
    expect(sql).not.toMatch(/\bGRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/iu);
    for (const [table, key, bound] of [["core.path_outcome", "path_id", 524288], ["core.path_gap_round", "run_id", 262144]] as const) {
      const short = table.slice("core.".length);
      expect(sql).toContain(`CREATE TRIGGER aaa_enforce_content_attestation_v2 BEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_content_attestation_v2_${short}();`);
      expect(sql).toContain(`CREATE TRIGGER enforce_content_ciphertext BEFORE INSERT ON ${table}\nFOR EACH ROW EXECUTE FUNCTION core.enforce_content_ciphertext_${short}();`);
      // The envelope is bound to the carrier the trigger names and to the row's own key, so it cannot be copied onto another row.
      const attestation = bodyOf(sql, `core.enforce_content_attestation_v2_${short}`);
      expect(attestation).toContain("TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME");
      expect(attestation).toContain(key === "run_id" ? "NEW.run_id::text" : "NEW.path_id");
      expect(attestation).toContain("NEW.content_attestation := expected_attestation;");
      // The contract's largest answer (and forty longest gap points) in a three-byte script, sealed, fits: tests/integration/path-results-repository.
      expect(tableBody(sql, table)).toContain(`content_ciphertext jsonb NOT NULL CONSTRAINT ${short}_content_size CHECK (octet_length(content_ciphertext::text) <= ${bound})`);
    }
    for (const table of CARRIED) expect(CONTENT_CARRIERS as readonly string[], table).toContain(table);
    for (const table of ["core.path_root", "core.path_root_repoint"]) {
      expect(CONTENT_CARRIERS as readonly string[], table).not.toContain(table);
      expect(tableBody(sql, table), table).not.toMatch(/ciphertext|attestation|content/u);
    }
  });

  it("C-K: codes only, the contract's states, the path ids and the roots of this run", () => {
    const sql = code(read(SQL_PATH));
    const root = tableBody(sql, "core.path_root");
    const repoint = tableBody(sql, "core.path_root_repoint");
    const outcome = tableBody(sql, "core.path_outcome");
    const gap = tableBody(sql, "core.path_gap_round");
    const patterns = [root, repoint, outcome].map((body) => /CHECK \(path_id ~ '([^']+)'\)/u.exec(body)?.[1]);
    expect(patterns).toEqual(["^b[1-8]$", "^b[1-8]$", "^b[1-8]$"]);
    const id = new RegExp(patterns[0]!, "u");
    for (let no = 1; no <= 8; no += 1) expect(id.test(pathIdOf(no)), pathIdOf(no)).toBe(true);
    for (const refused of ["b0", "b9", "B1", "a1", "b1 ", "kp01"]) expect(id.test(refused), refused).toBe(false);
    const states = /CHECK \(state IN \(([^)]*)\)\)/u.exec(outcome)?.[1];
    expect([...(states ?? "").matchAll(/'([^']*)'/gu)].map((value) => value[1])).toEqual([...PATH_OUTCOME_STATES]);
    expect(root).toContain("PRIMARY KEY (run_id, path_id)");
    expect(root).toContain("UNIQUE (run_id, root_index)");
    expect(root).toContain("CHECK (root_index BETWEEN 0 AND 7)");
    expect(root).toContain("FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id)");
    expect(root).toContain("core.jsonb_is_code_token(to_jsonb(maker))");
    expect(repoint).toContain("PRIMARY KEY (run_id, path_id, from_root_node_id)");
    expect(repoint).toContain("UNIQUE (run_id, root_node_id)");
    expect(repoint).toContain("FOREIGN KEY (run_id, from_root_node_id) REFERENCES core.node(run_id, node_id)");
    expect(repoint).toContain("FOREIGN KEY (run_id, root_node_id) REFERENCES core.node(run_id, node_id)");
    expect(repoint).toContain("CHECK (from_root_node_id <> root_node_id)");
    expect(repoint).toContain("repointed_at timestamptz NOT NULL");
    expect(outcome).toContain("PRIMARY KEY (run_id, path_id)");
    expect(gap).toContain("run_id uuid PRIMARY KEY REFERENCES core.run(run_id)");
    expect(gap).toContain("CHECK (round_count BETWEEN 0 AND 2)");
    // The readable text columns are codes: no path's words, outcome text or gap point in plain text anywhere.
    const textColumns = [root, repoint, outcome, gap].flatMap((body) => [...body.matchAll(/^ {2}([a-z_]+) text\b/gmu)].map((match) => match[1]!)).sort();
    expect(textColumns).toEqual(["maker", "maker", "path_id", "path_id", "path_id", "state"]);
  });

  it("C-W: a root moves only away from a stale root, to a live node of the same debate, in the writer", () => {
    const sql = code(read(SQL_PATH));
    const write = bodyOf(sql, "core.write_path_root");
    for (const needle of ["ON CONFLICT (run_id, path_id) DO NOTHING", "'INSERTED'", "'ALREADY_PRESENT'", "'REPOINTED'", "'RUN_ERASED'",
      "generation_status", "'stale'", "INSERT INTO core.path_root_repoint", "pg_advisory_xact_lock"]) {
      expect(write, needle).toContain(needle);
    }
    for (const name of ["core.record_path_outcome", "core.record_path_gap_round"]) {
      const body = bodyOf(sql, name);
      for (const needle of ["ON CONFLICT", "'RECORDED'", "'ALREADY'", "'RUN_ERASED'"]) expect(body, `${name} ${needle}`).toContain(needle);
    }
    for (const name of ["core.read_path_roots", "core.read_path_outcomes", "core.read_path_gap_round"]) {
      expect(bodyOf(sql, name), name).toContain("core.run_private_content_is_live");
    }
  });

  it("C-G: six EXECUTE grants to the runtime only, and no new core function is left to PUBLIC (the content-provision boot count)", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/^GRANT ([^\n]+);$/gmu)].map((match) => match[1])).toEqual(DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature} TO debateai_runtime`));
    // Whole-file, not line by line: a GRANT split over two lines, indented or inside a DO block counts too.
    expect(sql.match(/\bGRANT\b/giu)).toHaveLength(6);
    for (const signature of [...GUARDS.map((name) => `${name}()`), ...DEFINERS]) {
      expect(sql, signature).toMatch(new RegExp(`^REVOKE ALL ON FUNCTION ${signature.replace(/[.()]/gu, "\\$&")} FROM PUBLIC`, "mu"));
    }
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH))
      .toEqual([{ roleName: "debateai_runtime", source: SQL_PATH, grants: DEFINERS.map((signature) => `EXECUTE ON FUNCTION ${signature}`) }]);
  });

  it("C-R is documented and listed", () => {
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of ["packages/db/src/migration-forward0159.ts", "packages/db/src/path-results.ts"]) expect(corpus, path).toContain(path);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0159, below) the forty-eighth", "## The path results per run (0159)", "`loadForward0159`", "MIGRATION_FORWARD0159_", "-- n1: expand", "-- n1: keeps-verifier"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0159_path_results.sql` (after `0158_start_paths.sql`, `n1: expand`)");
  });
});
