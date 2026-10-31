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
 * 0137 (plan 2026-10-31-r22-owner-changes decision 13): each dig on a public debate and its AI check, what it changed on the public page under the publication's key, a Free debate's public way, who pays a report on someone else's public debate, and four spend sources; `expand`, keeping 0130's verifier. No database here: the behaviour is tests/integration/r22-foundation-database.test.ts.
 */
const NAME = "0137_public_debates.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-debates-forward0137.json";
const PREVIOUS = "0136_investigation_reports.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/investigation-reports-forward0136.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));

const TABLES = ["identity.public_contribution", "identity.public_debate_update", "identity.free_public_ask", "identity.public_report_writer", "identity.public_report_charge"] as const;
const FUNCTIONS = [
  "identity.guard_public_debate_record()",
  "core.current_publication_of_run(uuid)",
  "core.run_of_publication(uuid)",
  "identity.join_public_investigation(uuid,uuid,uuid,text[],text,text)",
  "identity.record_public_dig_picks(uuid,uuid,jsonb)",
  "identity.public_contribution_json(identity.public_contribution)",
  "identity.read_own_public_contributions(uuid,uuid)",
  "identity.read_public_contribution_of_run(uuid)",
  "identity.settle_public_contribution(uuid,text,uuid)",
  "identity.record_public_debate_update(uuid,uuid,text,text,uuid,jsonb)",
  "identity.read_public_debate_updates(uuid)",
  "identity.public_author_name_gone(uuid)",
  "identity.record_free_public_ask(uuid,uuid)",
  "identity.read_free_debates_to_publish(integer)",
  "identity.claim_free_public_ask(uuid)",
  "identity.mark_free_public_published(uuid,uuid)",
  "core.prepare_free_publication(uuid,uuid)",
  "core.publish_free_debate(uuid,uuid,text,jsonb,timestamptz)",
  "identity.refuse_free_publication(uuid)",
  "identity.record_public_report_charge(uuid,uuid,uuid,integer,bigint)",
  "identity.read_public_report_spent(uuid,timestamptz,timestamptz)",
  "identity.forget_erased_debate_public(uuid)",
  "identity.read_data_export_public_debates(uuid,uuid)"
] as const;
const CARRIERS = [] as const;

describe("0137: public debates anyone can dig", () => {
  it("C-T is a step of the chain's STEPS, after 0136, with its own loader", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0137 } from './migration-forward0137.js';");
    expect(chain).toContain("loadForward0136,loadForward0137");
    const loader = read("packages/db/src/migration-forward0137.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-debates-forward0137-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-debates-forward0137.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain("MIGRATION_FORWARD0137_");
    expect(loader).toContain("export async function loadForward0137(");
    for (const table of TABLES) expect(loader).toContain(`"${table}"`);
    for (const signature of FUNCTIONS) expect(loader).toContain(`"${signature}"`);
    expect(loader).not.toContain("model_spend_spend_source_check");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    expect(plan.forwardChain.find((step) => step.name === NAME)?.replayVerifierSql).toBeUndefined();
  });

  it("C-M is bound to 0136's manifest and to the verifier in force (0130's)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string };
    expect(manifest).toEqual({
      version: "public-debates-forward0137-v1",
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

  it("C-A passes the N-1 audit and the replay audit", async () => {
    const sql = read(SQL_PATH);
    const earlierFunctions = new Set<string>();
    const earlierRelations = new Set<string>();
    for (const name of readdirSync(new URL("migrations/", ROOT)).filter((entry) => /^\d{4}_.*\.sql$/u.test(entry) && entry < NAME)) {
      const source = read(`migrations/${name}`);
      for (const defined of definedFunctionNames(source)) earlierFunctions.add(defined);
      for (const defined of definedRelationNames(source)) earlierRelations.add(defined);
    }
    for (const table of TABLES) expect(earlierRelations.has(table), table).toBe(false);
    // Never CREATE OR REPLACE a function another migration defines.
    for (const signature of FUNCTIONS) expect(earlierFunctions.has(nameOf(signature)), signature).toBe(false);
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const plan = await loadMigrationPlan();
    expect(auditMigrationReplaySafety(SQL_PATH, sql, {
      plan, migrateSource: read("packages/db/src/index.ts"), transactionSource: read("packages/db/src/migration-transaction.ts")
    })).toEqual([]);
  });

  it("C-O guards every table, no role reads one, and no text is kept in clear", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([...TABLES]);
    for (const table of TABLES) {
      expect(sql, table).toContain(`SELECT core.install_truncate_guard('${table}');`);
      expect(sql, table).toMatch(new RegExp(`^REVOKE ALL ON ${table.replace(".", "\\.")} FROM PUBLIC,`, "mu"));
      const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
      const columns = sql.slice(at, sql.indexOf("\n);", at));
      expect(columns, table).not.toMatch(/\b(?:text|question|answer|quote|summary|line|reason)\s+text\b/u);
    }
    expect(sql).not.toMatch(/^GRANT [^\n]*\bON (?:TABLE )?identity\./mu);
    for (const carrier of CARRIERS) expect(CONTENT_CARRIERS as readonly string[], carrier).toContain(carrier);
  });

  it("C-S the stranger's dig stays out of 0134's tables, the name is read live, and the page's updates are sealed under the publication's key", () => {
    const sql = code(read(SQL_PATH));
    const body = (name: string): string => { const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`); return sql.slice(at, sql.indexOf("\n$$;", at)); };
    expect(body("identity.join_public_investigation")).toContain("INSERT INTO identity.investigation_member");
    expect(body("identity.join_public_investigation")).not.toMatch(/identity\.path_rewrite/u);
    expect(body("identity.record_public_dig_picks")).toContain("VALUES (p_run_id, p_owner_ref, v_parent, NULL, v_count);");
    expect(sql).not.toMatch(/pseudonym\s+text/u);
    expect(sql).toContain("content_ciphertext->>'keyId' = 'publication-snapshot:' || publication_ref::text || ':v1'");
    expect(sql).toMatch(/owner_ref uuid REFERENCES identity\."user"\(owner_ref\) ON DELETE SET NULL,\n\s*publication_ref/u);
    // The new sources name their run; every source the release before writes stays in the list.
    const sources = (text: string): string[] | undefined => text.match(/spend_source IN \(([^)]*)\)\) NOT VALID/u)?.[1]?.match(/'[^']+'/gu);
    expect(sources(sql)).toEqual([...(sources(code(read("migrations/0136_investigation_reports.sql"))) ?? []),
      "'PATH_CLIMB'", "'ANSWER_UPDATE'", "'CONTRIBUTION_CHECK'", "'PUBLIC_REPORT'"]);
    expect(sql).toContain("ADD CONSTRAINT model_spend_r22_sources_name_their_run");
    // The binding 0110's trigger reads is made and consumed in one transaction; no step-up grant is written.
    const publish = body("core.publish_free_debate");
    expect(publish).toContain("INSERT INTO identity.publication_event_binding");
    expect(publish).toContain("SET consumed_at = v_now");
    expect(publish).not.toContain("step_up_grant");
  });

  it("C-U no Unpublish route; the database's history stays readable", () => {
    const contract = read("packages/contract/src/index.ts");
    expect(contract).not.toContain('"POST /v1/runs/{id}/unpublish"');
    expect(read("apps/api/src/index.ts")).not.toContain("/v1/runs/{id}/unpublish");
    expect(read("packages/db/src/publication.ts")).toContain("async unpublish(");
  });

  it("C-E the erasure role and the export worker reach their functions", () => {
    expect(read("packages/db/src/erasure-page-memory.ts")).toContain('"SELECT identity.forget_erased_debate_public($1)"');
    expect(read("packages/db/src/account-erasure.ts")).toContain("FORGET_ERASED_DEBATE_PUBLIC");
    expect(read("packages/db/src/data-export.ts")).toContain('"identity.read_data_export_public_debates(uuid,uuid)",');
  });

  it("C-P discloses its grants and lists its files in the shipped corpus", () => {
    const manifest = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    const sql = read(SQL_PATH);
    const actual = [...sql.matchAll(/^GRANT ([^\n]+) TO ([a-z_]+);$/gmu)].map((match) => `${match[2]}: ${match[1]}`).sort();
    const declared = manifest.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH)
      .flatMap(({ roleName, grants }) => grants.map((grant) => `${roleName}: ${grant}`)).sort();
    expect(actual).toEqual(declared);
    expect(actual.length).toBeGreaterThan(0);
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    expect(corpus).toContain("packages/db/src/migration-forward0137.ts");
    expect(read("tests/ci-integration-auth.txt").split("\n")).toContain("tests/integration/r22-foundation-database.test.ts");
  });

  it("C-R is documented as the twenty-seventh step", () => {
    const readme = read("migrations/lineage/README.md");
    expect(readme.replace(/\s+/gu, " ")).toContain("(0137, below) the twenty-seventh");
    const heading = "## The public debates (0137)";
    const at = readme.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const section = readme.slice(at, readme.indexOf("\n## ", at + heading.length)).replace(/\s+/gu, " ");
    for (const needle of ["twenty-seventh", NAME, "public-debates-forward0137.json", "packages/db/src/migration-forward0137.ts",
      "`loadForward0137`", "MIGRATION_FORWARD0137_", "-- n1: expand", "-- n1: keeps-verifier", "renumber"]) expect(section, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md")).toContain("`migrations/0137_public_debates.sql` (after `0136_investigation_reports.sql`, `n1: expand`)");
  });
});
