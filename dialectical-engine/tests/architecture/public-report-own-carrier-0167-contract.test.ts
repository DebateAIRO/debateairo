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
 * 0167 (V4 start step, plan 2026-11-03 Task 56h; the owner's answer of 7 Nov afternoon, Q5, "Yes, from what is there"): a visitor writes a
 * public debate's report from what the published debate already holds, with no dig first, when its author has left. One API definer,
 * identity.open_public_report_own_carrier: 0147's press, the same answers in the same order, with two more carriers after the dig,
 * both the presser's own (their earlier report's carrier of the debate, else the run the API made for this report). Expand: a new
 * signature of a name 0147 defines; 0147's four-argument press and everything earlier stay as they are.
 */
const NAME = "0167_public_report_own_carrier.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-report-own-carrier-forward0167.json";
const LOADER_PATH = "packages/db/src/migration-forward0167.ts";
const PREVIOUS = "0166_main_answer_times.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/main-answer-times-forward0166.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const PRESS = "identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid)";
const PRESS_0147 = "identity.open_public_report(uuid,uuid,uuid,boolean)";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal of 0167 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const bodyOf = (sql: string): string => {
  const at = sql.indexOf("CREATE OR REPLACE FUNCTION identity.open_public_report_own_carrier(");
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at)));
};
const earlierSources = (): string[] => readdirSync(new URL("migrations/", ROOT))
  .filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME).sort().map((name) => read(`migrations/${name}`));

describe("0167: a visitor's report of a public debate carried by a run of their own", () => {
  it("C-T is a step of the chain, right after 0166, with its own loader and no amendment, and 0168 follows it", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0167 } from './migration-forward0167.js';");
    expect(chain).toContain("loadForward0165,loadForward0166,loadForward0167,loadForward0168,loadForward0169,loadForward0170,loadForward0171,loadForward0172,loadForward0173,loadForward0174]);");
    const plan = await loadMigrationPlan();
    expect(plan.forwardChain.at(-8)!.name).toBe(NAME);
    expect(plan.forwardChain.at(-9)!.name).toBe(PREVIOUS);
    const step = plan.forwardChain.at(-8)!;
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.previousManifestSha256).toBe(plan.forwardChain.at(-9)!.manifestSha256);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.amendsPostconditionsOf).toEqual([]);
    expect(step.replayVerifierSql).toBeUndefined();
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-report-own-carrier-forward0167-v1";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain(`const FUNCTIONS: readonly string[] = ["${PRESS}"];`);
    expect(loader).toContain("MIGRATION_FORWARD0167_");
  });

  it("C-M is bound to 0166's manifest and to the verifier in force (0130's, which 0166 keeps)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "public-report-own-carrier-forward0167-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it is expand and keeps the verifier: one new signature, no relation, 0147's press untouched; both audits pass", async () => {
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
    const earlier = earlierSources();
    for (const source of earlier) {
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, { earlierFunctions, earlierRelations, keepsVerifier: true })).toEqual([]);
    expect([...definedRelationNames(sql)]).toEqual([]);
    expect([...definedFunctionNames(sql)]).toEqual(["identity.open_public_report_own_carrier"]);
    // A name of its own (the N-1 audit refuses an expand step that replaces a name an earlier step defines): no earlier step defines, grants
    // or names it, and 0147's four-argument press is defined by 0147 alone.
    expect(earlierFunctions.has("identity.open_public_report_own_carrier")).toBe(false);
    for (const source of earlier) {
      expect(source).not.toContain(PRESS);
      expect(source).not.toContain("p_free boolean, p_own_run_id uuid");
    }
    expect(earlier.filter((source) => source.includes(
      "CREATE OR REPLACE FUNCTION identity.open_public_report(p_owner_ref uuid, p_publication_ref uuid, p_report_id uuid, p_free boolean)\n"))).toHaveLength(1);
    expect(code(sql)).toContain(
      "CREATE OR REPLACE FUNCTION identity.open_public_report_own_carrier(p_owner_ref uuid, p_publication_ref uuid, p_report_id uuid, p_free boolean, p_own_run_id uuid)");
    // 0147's press is only read (its owner, for the new one); nothing alters, drops, revokes or grants on it.
    expect([...code(sql).matchAll(/identity\.open_public_report\(uuid,uuid,uuid,boolean\)/gu)]).toHaveLength(1);
    expect(code(sql)).toContain(`WHERE p.oid = '${PRESS_0147}'::regprocedure;`);
    expect(code(sql)).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
  });

  it("C-O the press: a volatile definer on pg_catalog alone, 0147's answers in 0147's order, then the presser's own two carriers", () => {
    const body = bodyOf(code(read(SQL_PATH))).replace(/\s+/gu, " ");
    expect(body).not.toBe("");
    expect(body).toContain("RETURNS TABLE (outcome text, report_id uuid, report_version integer, carrier_run_id uuid) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    // 0147's answers, in its order: invalid, NOT_PUBLIC, WRITING, ONGOING, then the carriers, then NO_CARRIER or OPENED.
    const order = ["MESSAGE='PUBLIC_REPORT_INVALID'", "'NOT_PUBLIC'::text", "'WRITING'::text", "'ONGOING'::text", "'NO_CARRIER'::text", "'OPENED'::text"]
      .map((needle) => body.indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    // One lock per publication, as 0147's press.
    expect(body).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:public-tree:' || p_publication_ref::text, 0))");
    // (1) the debate's own run while its author is here, (2) the newest allowed dig whose digger is here, the presser's own first.
    expect(body).toContain("IF identity.web_evidence_run_owner(v_root) IS NOT NULL AND core.run_private_content_is_live(v_root) THEN v_carrier := v_root;");
    expect(body).toContain("ORDER BY (contribution.owner_ref IS NOT DISTINCT FROM p_owner_ref) DESC, contribution.contributed_at DESC, contribution.dig_run_id LIMIT 1;");
    // (3) the presser's own carrier of an earlier report of this debate: theirs, live, not the debate's run, no debate ever ran or waits on it.
    const thirdAt = body.indexOf("SELECT report.carrier_run_id INTO v_carrier");
    expect(thirdAt).toBeGreaterThan(0);
    const third = body.slice(thirdAt, body.indexOf("ORDER BY report.report_version DESC LIMIT 1;", thirdAt));
    for (const needle of ["report.writer_ref = p_owner_ref", "report.carrier_run_id <> v_root",
      "identity.web_evidence_run_owner(report.carrier_run_id) = p_owner_ref", "core.run_private_content_is_live(report.carrier_run_id)",
      "NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = report.carrier_run_id)",
      "NOT EXISTS (SELECT 1 FROM core.run_wait AS wait WHERE wait.run_id = report.carrier_run_id)"]) expect(third, needle).toContain(needle);
    // (4) the run the API made for this report, only when nothing before carries it: the presser's own, live, not the debate's, never a debate's.
    expect(body).toContain("IF v_carrier IS NULL AND p_own_run_id IS NOT NULL AND p_own_run_id <> v_root AND identity.web_evidence_run_owner(p_own_run_id) = p_owner_ref AND core.run_private_content_is_live(p_own_run_id) AND NOT EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = p_own_run_id) AND NOT EXISTS (SELECT 1 FROM core.run_wait AS wait WHERE wait.run_id = p_own_run_id) THEN v_carrier := p_own_run_id;");
    expect(body.indexOf("SELECT report.carrier_run_id INTO v_carrier")).toBeGreaterThan(body.indexOf("contribution.dig_run_id INTO v_carrier"));
    expect(body.indexOf("v_carrier := p_own_run_id;")).toBeGreaterThan(body.indexOf("SELECT report.carrier_run_id INTO v_carrier"));
    // Who pays is unchanged: the writer is the presser.
    expect(body).toContain("INSERT INTO identity.public_report (report_id, publication_ref, report_version, writer_ref, carrier_run_id, free) VALUES (p_report_id, p_publication_ref, v_version, p_owner_ref, v_carrier, p_free);");
  });

  it("C-G owned by the owner of 0147's four-argument press, revoked from every role first, then granted to debateai_billing_runtime alone", () => {
    const sql = code(read(SQL_PATH));
    expect(read(SQL_PATH)).toMatch(/^-- n1: reviewed gives only the new function its owner, the owner of 0147's four-argument press; touches no earlier object\nDO \$public_report_own_carrier_owner\$$/mu);
    expect(sql).toContain(`EXECUTE pg_catalog.format('ALTER FUNCTION %s OWNER TO %I', '${PRESS}', v_owner);`);
    expect(sql).toContain(`EXECUTE 'REVOKE ALL ON FUNCTION ${PRESS} FROM PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker';`);
    expect([...sql.matchAll(/^GRANT (.*)$/gmu)].map((match) => match[1])).toEqual([`EXECUTE ON FUNCTION ${PRESS} TO debateai_billing_runtime;`]);
  });

  it("C-W the API's press calls the five-argument signature", () => {
    expect(read("packages/db/src/public-tree.ts"))
      .toContain('"SELECT outcome,report_id,report_version,carrier_run_id FROM identity.open_public_report_own_carrier($1,$2,$3,$4,$5)"');
  });

  it("C-R is documented and listed", () => {
    expect(read("tests/support/shipped-corpus.manifest.txt").split("\n")).toContain(LOADER_PATH);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0167, below) the fifty-seventh", "## A visitor's report of a public debate carried by a run of their own (0167)", "`loadForward0167`",
      "MIGRATION_FORWARD0167_", "`-- n1: expand`", "`identity.open_public_report_own_carrier(uuid,uuid,uuid,boolean,uuid)`"]) expect(readme, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md"))
      .toContain("`migrations/0167_public_report_own_carrier.sql` (after `0166_main_answer_times.sql`, `n1: expand`)");
    const principals = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(principals.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH))
      .toEqual([{ roleName: "debateai_billing_runtime", source: SQL_PATH, grants: [`EXECUTE ON FUNCTION ${PRESS}`] }]);
  });
});
