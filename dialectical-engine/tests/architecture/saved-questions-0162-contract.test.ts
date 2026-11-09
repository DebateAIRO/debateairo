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
 * 0162 (V4 start step, plan 2026-11-03 Task 39d; saved-questions spec 2026-11-04 §3.1, §3.8, §3.14; owner answers S3 A, S4 A and S5 A of
 * 4 Nov): the questions a person has not started yet. One identity table keyed by the account (ON DELETE CASCADE, so the account's closing
 * removes the rows), whose two parts are envelopes naming the row's own key (`saved-question:<id>:v1`), never a key, a text or a fingerprint;
 * five API functions for the API's own role and one export reader for the export worker; 0115's export owner owns all of it, as 0131 §6. The
 * question keys live outside the database (packages/crypto FileSavedQuestionKeyStore), and the account's closing destroys them in its own key
 * step (packages/db/src/account-erasure.ts). No database here: the behaviour is tests/integration/saved-questions-database.test.ts.
 */
const NAME = "0162_saved_questions.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/saved-questions-forward0162.json";
const PREVIOUS = "0161_path_progress.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/path-progress-forward0161.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0162 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.saved_question";
const API_FUNCTIONS = [
  "identity.create_saved_question(uuid,uuid,jsonb,jsonb)",
  "identity.save_saved_question(uuid,uuid,integer,jsonb,jsonb)",
  "identity.read_saved_questions(uuid,integer)",
  "identity.read_saved_question(uuid,uuid)",
  "identity.delete_saved_question(uuid,uuid)"
] as const;
const EXPORT_READER = "identity.read_data_export_saved_questions(uuid,uuid)";
const FUNCTIONS = [...API_FUNCTIONS, EXPORT_READER] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("\n);", at));
};
const headOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("AS $$", at));
};
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
};
/** One table constraint `CONSTRAINT <name> CHECK (...)`, up to its closing parenthesis. */
const constraintOf = (body: string, name: string): string => {
  const at = body.indexOf(`CONSTRAINT ${name} CHECK (`);
  if (at < 0) return "";
  let depth = 0;
  for (let index = body.indexOf("(", at); index < body.length; index += 1) {
    if (body[index] === "(") depth += 1;
    if (body[index] === ")") depth -= 1;
    if (depth === 0) return body.slice(at, index + 1);
  }
  return "";
};

describe("0162: the questions not started yet, each under its own key", () => {
  it("C-T is the step right after 0161, found by name, with its own loader and no amendment", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0162 } from './migration-forward0162.js';");
    expect(chain).toContain("loadForward0161,loadForward0162");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    // Found by name, never as the chain's last step: the steps after it (0163, Task 56a) need no edit here.
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)!.amendsPostconditionsOf).toEqual([]);
    const loader = read("packages/db/src/migration-forward0162.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "saved-questions-forward0162-v1";');
    expect(loader).toContain('const PREVIOUS = "0161_path_progress.sql";');
    expect(loader).toContain('const TABLES: readonly string[] = ["identity.saved_question"];');
    for (const signature of FUNCTIONS) expect(loader, signature).toContain(`"${signature}"`);
    expect(loader).toContain("MIGRATION_FORWARD0162_");
  });

  it("C-M is bound to 0161's manifest and to the verifier in force (0130's, which 0161 keeps)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "saved-questions-forward0162-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it is expand and keeps the verifier, and stays outside row security", () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: expand$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    expect(sql).toContain("Row security: outside 0130's scope rule: no request role can SELECT this table.");
    expect(code(sql)).not.toMatch(/ROW LEVEL SECURITY|CREATE POLICY/iu);
  });

  it("C-A passes the replay audit and the N-1 audit, and only through its one reviewed owner block; nothing it creates existed before", async () => {
    const sql = read(SQL_PATH);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
    const earlier = readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort();
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of earlier) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    expect(earlierRelations.has(TABLE)).toBe(false);
    for (const signature of FUNCTIONS) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    expect([...definedRelationNames(sql)]).toEqual([TABLE]);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1])).toEqual(["N1_DYNAMIC_SQL"]);
  });

  it("C-O one table keyed by the account with ON DELETE CASCADE: uuid, uuid, integer, jsonb, jsonb, timestamptz, timestamptz, and no key or text column", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([TABLE]);
    const body = tableBody(sql);
    expect(body).not.toBe("");
    const columns = [...body.matchAll(/^ {2}([a-z_]+) ([a-z]+)\b/gmu)].filter((match) => match[1] !== "CONSTRAINT")
      .map((match) => [match[1], match[2]]);
    expect(columns).toEqual([
      ["saved_question_id", "uuid"], ["owner_ref", "uuid"], ["revision", "integer"], ["title_ciphertext", "jsonb"],
      ["content_ciphertext", "jsonb"], ["created_at", "timestamptz"], ["updated_at", "timestamptz"]
    ]);
    expect(body).toContain("saved_question_id uuid PRIMARY KEY");
    expect(body).toContain('owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE');
    expect(body).toMatch(/revision integer NOT NULL (?:CONSTRAINT [a-z_]+ )?CHECK \(revision >= 1\)/u);
    expect(body).toContain("title_ciphertext jsonb NOT NULL");
    expect(body).toContain("content_ciphertext jsonb NOT NULL");
    expect(body).toContain("created_at timestamptz NOT NULL DEFAULT clock_timestamp()");
    expect(body).toContain("updated_at timestamptz NOT NULL DEFAULT clock_timestamp()");
    // Not a debate's row and not a content carrier: no link to a run, and (the seven columns above) no key, text, fingerprint, plan or version.
    expect(sql).not.toContain("REFERENCES core.run");
    expect(CONTENT_CARRIERS as readonly string[]).not.toContain(TABLE);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS saved_question_owner_recent ON identity.saved_question (owner_ref, updated_at DESC, saved_question_id);");
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
  });

  it("C-E both envelope CHECKs are table constraints naming the five keys, this row's own key and a size cap, without core.is_content_envelope", () => {
    const sql = code(read(SQL_PATH));
    const body = tableBody(sql);
    for (const [column, name, cap] of [
      ["title_ciphertext", "saved_question_title_envelope", 2_048],
      ["content_ciphertext", "saved_question_content_envelope", 917_504]
    ] as const) {
      const check = constraintOf(body, name).replace(/\s+/gu, " ");
      expect(check, name).not.toBe("");
      for (const needle of [
        `jsonb_typeof(${column}) = 'object'`,
        `${column} ?& ARRAY['v','keyId','nonce','ct','tag']`,
        `${column} - ARRAY['v','keyId','nonce','ct','tag'] = '{}'::jsonb`,
        `${column}->>'v' = '1'`,
        `${column}->>'keyId' = 'saved-question:' || saved_question_id::text || ':v1'`,
        `jsonb_typeof(${column}->'nonce') = 'string'`,
        `jsonb_typeof(${column}->'ct') = 'string'`,
        `jsonb_typeof(${column}->'tag') = 'string'`,
        `octet_length(${column}::text) <= ${cap}`
      ]) expect(check, `${name} ${needle}`).toContain(needle);
      // A missing part reads NULL, and a CHECK passes on NULL: the whole check is closed with COALESCE(..., false).
      expect(check, name).toMatch(/^CONSTRAINT [a-z_]+ CHECK \(COALESCE\(/u);
      expect(check, name).toMatch(/, false\)\)$/u);
    }
    expect(sql).not.toContain("user-dek:");
    expect(sql).not.toContain("run-content:");
    expect(sql).not.toContain("core.is_content_envelope");
  });

  it("C-F exactly six functions, each a definer with only pg_catalog on its path, owned in one block by 0115's export owner; nothing of 0040, 0110 or 0131 redefined", () => {
    const sql = read(SQL_PATH);
    const created = [...code(sql).matchAll(/^CREATE OR REPLACE FUNCTION ([a-z_.]+)\(/gmu)].map((match) => match[1]);
    expect(created).toEqual(FUNCTIONS.map(nameOf));
    expect([...definedFunctionNames(sql)]).toEqual(FUNCTIONS.map(nameOf));
    for (const signature of FUNCTIONS) {
      const head = headOf(code(sql), nameOf(signature));
      expect(head, signature).toMatch(/\n\s*SECURITY DEFINER\n/u);
      expect(head, signature).toMatch(/\n\s*SET search_path ?= ?pg_catalog\n/u);
    }
    for (const reader of ["identity.read_saved_questions", "identity.read_saved_question", "identity.read_data_export_saved_questions"]) {
      expect(headOf(code(sql), reader), reader).toMatch(/\n\s*STABLE\n/u);
    }
    for (const earlier of ["0040_account_erasure.sql", "0110_account_erasure_public_debates.sql", "0131_v4_account_memory.sql"]) {
      const theirs = definedFunctionNames(read(`migrations/${earlier}`));
      expect(theirs.length, earlier).toBeGreaterThan(0);
      for (const name of definedFunctionNames(sql)) expect(theirs, `${earlier} ${name}`).not.toContain(name);
    }
    expect(code(sql)).not.toMatch(/^\s*(?:ALTER|DROP) (?:TABLE|FUNCTION) /mu);
    // 0131 §6's owner block: 0115's export owner, found through its snapshot reader, owns the table and the six functions.
    const owner = sql.slice(sql.indexOf("DO $saved_questions_owner$"), sql.indexOf("$saved_questions_owner$;"));
    expect(owner).toContain("WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;");
    expect(owner).toContain("'ALTER TABLE %s OWNER TO %I'");
    expect(owner).toContain("'ALTER FUNCTION %s OWNER TO %I'");
    for (const signature of FUNCTIONS) expect(owner, signature).toContain(`'${signature}'`);
    expect(sql.split("\n")[sql.split("\n").findIndex((line) => line.startsWith("DO $saved_questions_owner$")) - 1]).toMatch(/^-- n1: reviewed \S/u);
    // The closing block checks the contract instead of assuming it.
    const contract = sql.slice(sql.indexOf("DO $saved_questions_contract$"), sql.indexOf("$saved_questions_contract$;"));
    expect(contract).toContain("SAVED_QUESTIONS_0162_CONTRACT");
    for (const signature of FUNCTIONS) expect(contract, signature).toContain(`'${signature}'`);
    expect(sql.lastIndexOf("DO $saved_questions_contract$")).toBeGreaterThan(sql.lastIndexOf("GRANT "));
  });

  it("C-W the five API functions: the 20 cap under a per-account lock, the revisions, GONE for another owner's id, the limits, the export behind 0128's lease", () => {
    const sql = code(read(SQL_PATH));
    const create = bodyOf(sql, "identity.create_saved_question").replace(/\s+/gu, " ");
    for (const needle of ["pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:saved-questions:' || p_owner_ref::text, 0))",
      "'SAVED_QUESTION_ACCOUNT_INVALID'", "'SAVED_QUESTION_ID_TAKEN'", "identity_user.state = 'active'", ">= 20", "'FULL'", "'CREATED'"]) {
      expect(create, needle).toContain(needle);
    }
    // The lock comes before the count, and the count before the insert.
    expect(create.indexOf("pg_advisory_xact_lock")).toBeLessThan(create.indexOf(">= 20"));
    expect(create.indexOf(">= 20")).toBeLessThan(create.indexOf("INSERT INTO identity.saved_question"));
    const save = bodyOf(sql, "identity.save_saved_question").replace(/\s+/gu, " ");
    for (const needle of ["'SAVED_QUESTION_ACCOUNT_INVALID'", "identity_user.state = 'active'", "FOR UPDATE", "'GONE'", "'REVISION'", "'SAVED'",
      "question.owner_ref = p_owner_ref"]) expect(save, needle).toContain(needle);
    const list = bodyOf(sql, "identity.read_saved_questions").replace(/\s+/gu, " ");
    for (const needle of ["'SAVED_QUESTION_LIMIT_INVALID'", "p_limit < 1", "p_limit > 20", "ORDER BY question.updated_at DESC", "LIMIT p_limit",
      "'title_ciphertext'", "'[]'::jsonb"]) expect(list, needle).toContain(needle);
    expect(list).not.toContain("content_ciphertext");
    const one = bodyOf(sql, "identity.read_saved_question").replace(/\s+/gu, " ");
    for (const needle of ["'title_ciphertext'", "'content_ciphertext'", "'created_at'", "'updated_at'", "question.owner_ref = p_owner_ref"]) {
      expect(one, needle).toContain(needle);
    }
    const remove = bodyOf(sql, "identity.delete_saved_question").replace(/\s+/gu, " ");
    for (const needle of ["DELETE FROM identity.saved_question", "question.owner_ref = p_owner_ref", "'DELETED'", "'GONE'"]) expect(remove, needle).toContain(needle);
    const reader = bodyOf(sql, "identity.read_data_export_saved_questions").replace(/\s+/gu, " ");
    for (const needle of ["v_user := identity.data_export_lease_user(p_export_id, p_worker);", "'content_ciphertext'", "'title_ciphertext'",
      "ORDER BY question.created_at, question.saved_question_id", "'[]'::jsonb"]) expect(reader, needle).toContain(needle);
  });

  it("C-G exactly six GRANT lines: the five API functions to the API's role, the reader to the export worker; never the runtime or erasure role", () => {
    const sql = code(read(SQL_PATH));
    expect(sql.split("\n").filter((line) => /^\s*GRANT /u.test(line))).toEqual([
      ...API_FUNCTIONS.map((signature) => `GRANT EXECUTE ON FUNCTION ${signature} TO debateai_billing_runtime;`),
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    // Whole-file, not line by line: a GRANT split over two lines, indented or inside a DO block counts too.
    expect(sql.match(/\bGRANT\b/gu)).toHaveLength(6);
    expect(sql).not.toMatch(/\bGRANT\b[^;]*\bTO\s+(?:debateai_runtime|debateai_erasure_runtime)\b/u);
    expect(sql).not.toMatch(/\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)\b/iu);
    expect(sql).toMatch(/^REVOKE ALL ON identity\.saved_question FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker;$/mu);
    for (const signature of FUNCTIONS) {
      expect(sql, signature).toMatch(new RegExp(`^REVOKE ALL ON FUNCTION ${signature.replace(/[.()]/gu, "\\$&")} FROM PUBLIC,`, "mu"));
    }
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)).toEqual([
      { roleName: "debateai_billing_runtime", source: SQL_PATH, grants: API_FUNCTIONS.map((signature) => `EXECUTE ON FUNCTION ${signature}`) },
      { roleName: "debateai_data_export_worker", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${EXPORT_READER}`] }
    ]);
  });

  it("C-K account closing destroys every question key after the debates' keys and before the account key, reads back none left, and counts debates only", () => {
    const erasure = read("packages/db/src/account-erasure.ts");
    expect(erasure).toContain('savedQuestionKeys?: Pick<SavedQuestionKeyStore, "listByOwner" | "destroy">;');
    const execute = erasure.slice(erasure.indexOf("private async executeUnderNotificationLease("),
      erasure.indexOf("async reconcileRunKeyProvisionIntents("));
    const runLoop = execute.indexOf("const result = await this.runs.destroy(runId);");
    const questionLoop = execute.indexOf("await savedQuestionKeys.destroy(id);");
    const userKey = execute.indexOf("const userDekResult = await this.users.destroy(cleanup.userId);");
    const runReadback = execute.indexOf("if ((await this.runs.listByOwner(cleanup.ownerRef)).length !== 0) return \"INVALID_EVIDENCE\";");
    const questionReadback = execute.indexOf("(await savedQuestionKeys.listByOwner(cleanup.ownerRef)).length !== 0");
    const finalize = execute.indexOf("this.repository.finalize(");
    for (const at of [runLoop, questionLoop, userKey, runReadback, questionReadback, finalize]) expect(at).toBeGreaterThan(-1);
    expect(runLoop).toBeLessThan(questionLoop);
    expect(questionLoop).toBeLessThan(userKey);
    expect(runReadback).toBeLessThan(questionReadback);
    expect(questionReadback).toBeLessThan(finalize);
    // finalize's arguments are unchanged: the question keys are destroyed and checked, never counted as debates' keys (0110 is not changed).
    expect(execute.slice(finalize, execute.indexOf("});", finalize)).replace(/\s+/gu, " ")).toBe(
      "this.repository.finalize({ erasureId, keyCleanupCompletedAt: completedAt, occurredAt: completedAt, source, destroyedRunKeyCount,"
      + " alreadyAbsentRunKeyCount, destroyedUserDekCount: userDekResult === \"DESTROYED\" ? 1 : 0,"
      + " alreadyAbsentUserDekCount: userDekResult === \"ALREADY_ABSENT\" ? 1 : 0 ");
    expect(execute.match(/destroyedRunKeyCount \+= 1/gu)).toHaveLength(1);
    expect(execute.match(/alreadyAbsentRunKeyCount \+= 1/gu)).toHaveLength(1);
  });

  it("C-R is documented, listed and lives in the API, not in the database package's index", () => {
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of ["packages/db/src/migration-forward0162.ts", "apps/api/src/saved-questions/store.ts"]) expect(corpus, path).toContain(path);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0162, below) the fifty-second", "## The saved questions (0162)", "`loadForward0162`", "MIGRATION_FORWARD0162_"]) {
      expect(readme, needle).toContain(needle);
    }
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0162_saved_questions.sql` (after `0161_path_progress.sql`, `n1: expand`)");
    expect(read("packages/db/src/index.ts")).not.toContain("saved-question");
    const store = read("apps/api/src/saved-questions/store.ts");
    expect(store).toContain('import type { CryptoEnvelope } from "@debateai/crypto";');
    expect(store).toContain('import type { AccountMemoryQuery } from "../account-memory.js";');
    // The store calls the five API functions, and nothing else of the database.
    expect([...store.matchAll(/identity\.([a-z_]+)\(/gu)].map((match) => match[1]).sort())
      .toEqual(["create_saved_question", "delete_saved_question", "read_saved_question", "read_saved_questions", "save_saved_question"]);
    expect(read("tests/integration/identity-database.test.ts")).toMatch(/\/\/ 0162[^\n]*\n\s*"saved_question",/u);
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/saved-questions-database.test.ts");
  });
});
