import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIN_ANSWER_TRIGGERS } from "../../packages/contract/src/web.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0164 (V4 start step, plan 2026-11-03 Task 55e; spec 2026-11-03 §4.4): a dig under the main question of a path debate ("+ N more", a path
 * left out before Start) updates the main answer, and its version names the dig itself as what made it. 0138's CHECK on
 * identity.main_answer_update.trigger_kind is widened by one kind, PATH_ADDED, and nothing else changes. 0138's postcondition digest pins
 * that CHECK, so the step declares an amendment of 0138's postcondition and is drained (an older release refuses an amendment it does not
 * know). No database here: the behaviour is tests/integration/v2-paths-report.test.ts.
 */
const NAME = "0164_main_answer_path_added.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/main-answer-path-added-forward0164.json";
const LOADER_PATH = "packages/db/src/migration-forward0164.ts";
const PREVIOUS = "0163_carry_on_session_free_digs.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/carry-on-forward0163.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal of 0164 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.main_answer_update";
const CHECK = "main_answer_update_trigger_check";
const AMENDS = [{ step: "0138_tree_updates.sql", relations: [TABLE], constraints: [CHECK], field: "constraint_definition" }];
/** The kinds a CHECK on trigger_kind lists, in its order. */
const kindsOf = (sql: string): readonly string[] => {
  const check = new RegExp(String.raw`CONSTRAINT ${CHECK} CHECK \(trigger_kind IN \(([^)]*)\)\)`, "u").exec(code(sql).replace(/\s+/gu, " "));
  return check === null ? [] : [...check[1]!.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]!);
};

describe("0164: a dig under the main question of a path debate updates the main answer", () => {
  it("C-T is the chain's head, right after 0163, found by name, with its own loader and its one declared amendment of 0138", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0164 } from './migration-forward0164.js';");
    expect(chain).toContain("loadForward0162,loadForward0163,loadForward0164,loadForward0165]);");
    // The amendment shape this step needs: a widened CHECK an earlier step's digest pins.
    expect(chain).toContain("|Readonly<{step:string;relations:readonly string[];constraints:readonly string[];field:'constraint_definition'}>;");
    const plan = await loadMigrationPlan();
    // Task 57c (0165): found by its name, so a later step leaves this pin alone.
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    const step = plan.forwardChain.find((entry) => entry.name === NAME)!;
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.amendsPostconditionsOf).toEqual(AMENDS);
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "main-answer-path-added-forward0164-v1";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain(`const TABLE = "${TABLE}";`);
    expect(loader).toContain(`const CONSTRAINT = "${CHECK}";`);
    expect(loader).toContain("MIGRATION_FORWARD0164_");
  });

  it("C-M is bound to 0163's manifest and to the verifier in force (0130's, which 0163 keeps), and carries the amendment", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "main-answer-path-added-forward0164-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: AMENDS
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it changes an earlier step's digested CHECK (drained) and keeps the verifier; both audits pass", async () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: false, drained: true, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: drained$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
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
    // No table, view or function of its own.
    expect([...definedRelationNames(sql)]).toEqual([]);
    expect([...definedFunctionNames(sql)]).toEqual([]);
  });

  it("C-O the CHECK lists exactly the three kinds, 0138's two and then PATH_ADDED; it is dropped IF EXISTS first; nothing else changes", () => {
    const sql = code(read(SQL_PATH));
    expect(kindsOf(read("migrations/0138_tree_updates.sql"))).toEqual(["PATH_REWRITE", "PATH_UPDATE"]);
    expect(kindsOf(read(SQL_PATH))).toEqual(["PATH_REWRITE", "PATH_UPDATE", "PATH_ADDED"]);
    const statements = sql.split(";").map((statement) => statement.replace(/\s+/gu, " ").trim()).filter((statement) => statement !== "");
    expect(statements).toEqual([
      `ALTER TABLE ${TABLE} DROP CONSTRAINT IF EXISTS ${CHECK}`,
      `ALTER TABLE ${TABLE} ADD CONSTRAINT ${CHECK} CHECK (trigger_kind IN ('PATH_REWRITE','PATH_UPDATE','PATH_ADDED'))`
    ]);
    // The page's kinds follow the database's in the same order (0138's PATH_UPDATE is the page's CHILD_PATH).
    expect(MAIN_ANSWER_TRIGGERS).toEqual(["PATH_REWRITE", "CHILD_PATH", "PATH_ADDED"]);
  });

  it("C-R is documented and listed", () => {
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0164, below) the fifty-fourth", "## A dig under the main question updates the main answer (0164)", "`loadForward0164`",
      "MIGRATION_FORWARD0164_", "`-- n1: drained`", "`constraint_definition`"]) expect(readme, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md"))
      .toContain("`migrations/0164_main_answer_path_added.sql` (after `0163_carry_on_session_free_digs.sql`, `n1: drained`)");
  });
});
