import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import {
  auditMigrationN1Compatibility,
  auditMigrationReplaySafety,
  definedFunctionNames,
  definedRelationNames
} from "../../tools/orphan-audit/src/index.js";

/**
 * 0166 (V4 start step, plan 2026-11-03 Task 56g; the coordinator's ruling of 7 Nov, option A of the Task 56f review): a later main-answer
 * version of a public debate always revises the newest one, whichever table holds it. One runner definer lists the debate's finished
 * versions 0147 does not hold (0138's, each at its own time, and the page's copies of those an erasure took, each at its copy's time), ids
 * and times only, whatever the debate's state. Expand: one new function, nothing earlier changes. The behaviour is
 * tests/integration/public-tree-flow.test.ts (the owner suspended again; erased after a suspension).
 */
const NAME = "0166_main_answer_times.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/main-answer-times-forward0166.json";
const LOADER_PATH = "packages/db/src/migration-forward0166.ts";
const PREVIOUS = "0165_pre_start_release.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/pre-start-release-forward0165.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const READER = "identity.read_main_answer_times(uuid)";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal of 0166 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const bodyOf = (sql: string): string => {
  const at = sql.indexOf("CREATE OR REPLACE FUNCTION identity.read_main_answer_times(");
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
};

describe("0166: a later main-answer version revises the newest one, whichever table holds it", () => {
  it("C-T is a step of the chain, right after 0165, with its own loader and no amendment", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0166 } from './migration-forward0166.js';");
    // Task 56h (0167): no longer the chain's head; found by its name below.
    expect(chain).toContain("loadForward0164,loadForward0165,loadForward0166,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    const step = plan.forwardChain.find((entry) => entry.name === NAME)!;
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.amendsPostconditionsOf).toEqual([]);
    expect(step.replayVerifierSql).toBeUndefined();
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "main-answer-times-forward0166-v1";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain(`const FUNCTIONS: readonly string[] = ["${READER}"];`);
    expect(loader).toContain("MIGRATION_FORWARD0166_");
  });

  it("C-M is bound to 0165's manifest as Task 57h left it and to the verifier in force (0130's, which 0165 keeps)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "main-answer-times-forward0166-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it is expand and keeps the verifier: one new function, no relation, nothing earlier redefined; both audits pass", async () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: expand$/mu);
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
    expect([...definedRelationNames(sql)]).toEqual([]);
    expect([...definedFunctionNames(sql)]).toEqual(["identity.read_main_answer_times"]);
    expect(earlierFunctions.has("identity.read_main_answer_times")).toBe(false);
    expect(code(sql)).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
  });

  it("C-O the reader: a stable definer on pg_catalog alone, ids and times only, 0138's finished rows and the page's copies of versions neither table holds", () => {
    const body = bodyOf(code(read(SQL_PATH))).replace(/\s+/gu, " ");
    expect(body).not.toBe("");
    expect(body).toContain("RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    // What it returns: three keys, never a content column.
    expect(body).toContain("jsonb_build_object('update_id', version.update_id, 'recorded_at', version.recorded_at, 'trigger_run_id', version.trigger_run_id)");
    expect(body).not.toMatch(/content|attestation|lineage|owner_ref/u);
    // 0138's finished versions of the root, whatever the root's state (no owner or liveness test).
    expect(body).toContain("FROM identity.main_answer_update AS row_found WHERE row_found.run_id = p_root_run_id AND row_found.outcome IN ('READY','READY_WITH_RESERVATION')");
    expect(body).not.toContain("web_evidence_run_owner");
    // The page's main-answer copies on the root's publications whose version neither 0138 nor 0147 holds any more.
    expect(body).toContain("FROM identity.public_debate_update AS copy WHERE copy.kind = 'MAIN_ANSWER'");
    expect(body).toContain("copy.publication_ref IN (SELECT snapshot.publication_ref FROM serve.publication_snapshot AS snapshot WHERE snapshot.run_id = p_root_run_id)");
    expect(body).toContain("NOT EXISTS (SELECT 1 FROM identity.main_answer_update AS kept WHERE kept.update_id = copy.update_id)");
    expect(body).toContain("NOT EXISTS (SELECT 1 FROM identity.public_answer_update AS kept WHERE kept.update_id = copy.update_id)");
    expect(body).toContain("ORDER BY version.recorded_at, version.update_id), '[]'::jsonb)");
  });

  it("C-G owned by the owner of 0147's readers, revoked from every role first, then granted to debateai_runtime alone", () => {
    const sql = code(read(SQL_PATH));
    expect(read(SQL_PATH)).toMatch(/^-- n1: reviewed gives only the new function its owner, the owner of 0138's and 0147's readers; touches no earlier object\nDO \$main_answer_times_owner\$$/mu);
    expect(sql).toContain("WHERE p.oid = 'identity.read_public_answer_updates(uuid)'::regprocedure;");
    expect(sql).toContain(`EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', '${READER}', v_owner);`);
    expect(sql).toContain(`EXECUTE 'REVOKE ALL ON FUNCTION ${READER} FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';`);
    expect([...sql.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([`EXECUTE ON FUNCTION ${READER} TO debateai_runtime;`]);
  });

  it("C-W the runner reads it only for a root that is not live, and then the page's copy stands for a newer version than 0147's newest", () => {
    expect(read("packages/db/src/public-tree.ts")).toContain('"SELECT identity.read_main_answer_times($1) AS times"');
    const sources = read("apps/runner/src/public-tree-sources.ts");
    expect(sources).toContain("if (!lives && keptVersionAfter(await publicTree.readMainAnswerTimes(rootRunId), row.recorded_at)) return null;");
    expect(sources.indexOf("readMainAnswerTimes")).toBeGreaterThan(sources.indexOf("const lives = await rootLives(liveTree, rootRunId);"));
  });

  it("C-R is documented and listed", () => {
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0166, below) the fifty-sixth", "## A later main-answer version revises the newest one, whichever table holds it (0166)", "`loadForward0166`",
      "MIGRATION_FORWARD0166_", "`-- n1: expand`", "`identity.read_main_answer_times(uuid)`"]) expect(readme, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md"))
      .toContain("`migrations/0166_main_answer_times.sql` (after `0165_pre_start_release.sql`, `n1: expand`)");
    const principals = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(principals.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH))
      .toEqual([{ roleName: "debateai_runtime", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${READER}`] }]);
  });
});
