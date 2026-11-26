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
 * 0193 (design docs/superpowers/specs/2026-11-26-public-debate-upvotes-design.md §5, §7.1): upvotes on public debates. One
 * identity table, one row per account and page; three functions for the API's own role, each asking whose connection it
 * is; the count and the sweep for the cross-account marker; the export reader for the export worker; 0115's export owner
 * owns all of it. No database here: the behaviour on real logins is tests/integration/public-debate-upvotes-0193.test.ts.
 */
const NAME = "0193_public_debate_upvotes.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/public-debate-upvotes-forward0193.json";
const PREVIOUS = "0192_registration_country_read.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/registration-country-read-forward0192.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal or body of 0193 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const TABLE = "identity.public_debate_upvote";
const CAST = "identity.cast_public_debate_upvote(uuid,uuid)";
const WITHDRAW = "identity.withdraw_public_debate_upvote(uuid,uuid)";
const READ_OWN = "identity.read_own_public_debate_upvotes(uuid,uuid[])";
const COUNTS = "identity.read_public_debate_upvote_counts(uuid[])";
const EXPORT_READER = "identity.read_data_export_public_debate_upvotes(uuid,uuid)";
const SWEEP = "identity.delete_gone_public_debate_upvotes(integer)";
/** In the file's order, which is the loader's FUNCTIONS order. */
const FUNCTIONS = [CAST, WITHDRAW, READ_OWN, COUNTS, EXPORT_READER, SWEEP] as const;
const nameOf = (signature: string): string => signature.slice(0, signature.indexOf("("));
const tableBody = (sql: string): string => {
  const at = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${TABLE} (`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("\n);", at));
};
/** One function from its CREATE line to the end of its body, on one line. */
const flat = (sql: string, signature: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${nameOf(signature)}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at))).replace(/\s+/gu, " ");
};
/** Every needle is there, each after the one before it. */
const inOrder = (text: string, needles: readonly string[]): boolean =>
  needles.every((needle, at) => text.indexOf(needle) > (at === 0 ? -1 : text.indexOf(needles[at - 1]!)));
const PUBLIC_NOW = "core.run_is_published(core.run_of_publication(p_publication_ref), p_publication_ref)";
const ASKS_OWNER = "IF NOT identity.request_owner_matches(p_owner_ref) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='REQUEST_OWNER_MISMATCH'; END IF;";
/** What the census of tests/integration/security-review-hardening-database.test.ts calls "asks the connection". */
const ASKS_CONNECTION = /identity\.(?:request_owner_matches|page_memory_run_owned)\(|rls\.(?:context_owner_ref|context_user_id|session_credential_hash)\(|staff\.require_http_authority\(|pg_has_role\(|core\.lock_owned_live_runs\(/u;
const EVERYONE = "PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker,debateai_staff_security_owner;";

describe("0193: upvotes on public debates", () => {
  it("C-T is the step right after 0192, found by name, with its own loader, no amendment and no verifier of its own", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0193 } from './migration-forward0193.js';");
    expect(chain).toContain("loadForward0192,loadForward0193");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    // Found by name, never as the chain's last step: a step after it needs no edit here.
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    const step = plan.forwardChain.find((entry) => entry.name === NAME)!;
    expect(step.amendsPostconditionsOf).toEqual([]);
    expect(step.replayVerifierSql).toBeUndefined();
    const loader = read("packages/db/src/migration-forward0193.ts");
    expect(loader).toContain(`const NAME = "${NAME}";`);
    expect(loader).toContain('const VERSION = "public-debate-upvotes-forward0193-v1";');
    expect(loader).toContain('const MANIFEST_PATH = "lineage/public-debate-upvotes-forward0193.json";');
    expect(loader).toContain('const VERIFIER_PATH = "lineage/verify-effective-capabilities-130.sql";');
    expect(loader).toContain(`const PREVIOUS = "${PREVIOUS}";`);
    expect(loader).toContain('const TABLES: readonly string[] = ["identity.public_debate_upvote"];');
    for (const signature of FUNCTIONS) expect(loader, signature).toContain(`"${signature}"`);
    expect(loader).toContain("export async function loadForward0193(anchor: ForwardStepAnchor): Promise<ForwardStepPlan>");
    expect(loader).toContain("MIGRATION_FORWARD0193_");
    expect(loader).not.toMatch(/MIGRATION_FORWARD0(?!193_)\d{3}_/u);
  });

  it("C-M is bound to 0192's manifest and to the verifier in force (0130's, which 0192 keeps)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier", "amendsPostconditionsOf"]);
    expect(manifest).toEqual({
      version: "public-debate-upvotes-forward0193-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 },
      amendsPostconditionsOf: []
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
    expect(sha256(read("migrations/lineage/verify-effective-capabilities-130.sql"))).toBe(VERIFIER_130);
    expect(read(MANIFEST_PATH)).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });

  it("C-H says truthfully that it is expand and keeps the verifier, and stays outside row security", () => {
    const sql = read(SQL_PATH);
    expect(parseN1Header(NAME, sql)).toEqual({ expand: true, drained: false, keepsVerifier: true, outsideTransaction: false, concurrentIndex: null });
    expect(sql).toMatch(/^-- n1: expand$/mu);
    expect(sql).toMatch(/^-- n1: keeps-verifier$/mu);
    expect(sql).toContain("row security    outside 0130's scope rule: no request role can SELECT this table.");
    expect(code(sql)).not.toMatch(/ROW LEVEL SECURITY|CREATE POLICY|CREATE TRIGGER|reject_mutation/iu);
    expect(code(sql)).not.toMatch(/\bbilling\./u);
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
      for (const created of ["public_debate_upvote", "delete_gone_public_debate_upvotes"]) expect(source, `${name} ${created}`).not.toContain(created);
    }
    expect([...definedRelationNames(sql)]).toEqual([TABLE]);
    expect([...definedFunctionNames(sql)]).toEqual(FUNCTIONS.map(nameOf));
    const context: N1AuditContext = { earlierFunctions, earlierRelations, keepsVerifier: true };
    expect(auditMigrationN1Compatibility(SQL_PATH, sql, context)).toEqual([]);
    const unreviewed = sql.split("\n").map((line) => (line.startsWith("-- n1: reviewed ") ? "-- (review removed)" : line)).join("\n");
    expect(auditMigrationN1Compatibility(SQL_PATH, unreviewed, context).map((finding) => finding.split(" ")[1])).toEqual(["N1_DYNAMIC_SQL"]);
  });

  it("C-O one table: the page, the account with ON DELETE CASCADE, a time; the pair is the primary key; a truncate guard and nothing else", () => {
    const sql = code(read(SQL_PATH));
    expect([...sql.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_.]+)/gu)].map((match) => match[1])).toEqual([TABLE]);
    const body = tableBody(sql);
    expect([...body.matchAll(/^ {2}([a-z_]+) ([a-z]+)\b/gmu)].map((match) => [match[1], match[2]]))
      .toEqual([["publication_ref", "uuid"], ["owner_ref", "uuid"], ["created_at", "timestamptz"]]);
    expect(body).toContain("  publication_ref uuid NOT NULL REFERENCES serve.publication_snapshot(publication_ref),\n");
    expect(body).toContain('  owner_ref uuid NOT NULL REFERENCES identity."user"(owner_ref) ON DELETE CASCADE,\n');
    expect(body).toContain("  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),\n");
    expect(body).toContain("  PRIMARY KEY (publication_ref, owner_ref)");
    // The page's row is never deleted (0039's trigger), so its key carries no ON DELETE: the account's is the only one.
    expect(body.match(/ON DELETE/gu)).toHaveLength(1);
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS public_debate_upvote_owner ON identity.public_debate_upvote (owner_ref, created_at);");
    expect(sql.match(/CREATE (?:UNIQUE )?INDEX/gu)).toHaveLength(1);
    expect(sql).toContain(`SELECT core.install_truncate_guard('${TABLE}');`);
  });

  it("C-F exactly six functions, each a plpgsql definer with only pg_catalog on its path, owned in one reviewed block by 0115's export owner", () => {
    const sql = read(SQL_PATH);
    const lines = code(sql).split("\n");
    const created = "CREATE OR REPLACE FUNCTION ";
    expect(lines.flatMap((line, at) => (line.startsWith(created) ? [[line.slice(created.length), lines[at + 1]]] : []))).toEqual([
      ["identity.cast_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb", "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.withdraw_public_debate_upvote(p_owner_ref uuid, p_publication_ref uuid) RETURNS jsonb", "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.read_own_public_debate_upvotes(p_owner_ref uuid, p_publication_refs uuid[]) RETURNS uuid[]", "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.read_public_debate_upvote_counts(p_publication_refs uuid[]) RETURNS jsonb", "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.read_data_export_public_debate_upvotes(p_export_id uuid, p_worker uuid) RETURNS jsonb", "LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$"],
      ["identity.delete_gone_public_debate_upvotes(p_limit integer) RETURNS integer", "LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$"]
    ]);
    expect(code(sql)).not.toMatch(/^\s*(?:ALTER|DROP) (?:TABLE|FUNCTION) /mu);
    const owner = sql.slice(sql.indexOf("DO $public_debate_upvotes_owner$"), sql.indexOf("$public_debate_upvotes_owner$;"));
    expect(owner).toContain("WHERE p.oid = 'identity.read_data_export_snapshot(uuid,uuid)'::regprocedure;");
    expect(owner).toContain("'ALTER TABLE identity.public_debate_upvote OWNER TO %I'");
    expect(owner).toContain("'ALTER FUNCTION %s OWNER TO %I'");
    for (const signature of FUNCTIONS) expect(owner, signature).toContain(`'${signature}'`);
    // The step refuses to apply where the owner could not ask what the six functions ask.
    for (const called of ["identity.request_owner_matches(uuid)", "core.run_is_published(uuid,uuid)", "core.run_of_publication(uuid)",
      "core.publication_is_current(uuid)", "identity.data_export_lease_user(uuid,uuid)"]) {
      expect(owner, called).toContain(`NOT pg_catalog.has_function_privilege(v_owner, '${called}', 'EXECUTE')`);
    }
    expect(owner).toContain("MESSAGE='PUBLIC_DEBATE_UPVOTES_OWNER_UNABLE'");
    const raw = sql.split("\n");
    expect(raw.filter((line) => line.startsWith("-- n1: reviewed "))).toHaveLength(1);
    expect(raw[raw.indexOf("DO $public_debate_upvotes_owner$") - 1]).toMatch(/^-- n1: reviewed \S/u);
    // The closing block checks the contract instead of assuming it, after the last grant.
    const contract = sql.slice(sql.indexOf("DO $public_debate_upvotes_contract$"), sql.indexOf("$public_debate_upvotes_contract$;"));
    expect(contract).toContain("PUBLIC_DEBATE_UPVOTES_CONTRACT");
    for (const signature of FUNCTIONS) expect(contract, signature).toContain(`'${signature}'`);
    expect(contract).toContain("'debateai_rls_all_accounts'");
    expect(sql.lastIndexOf("DO $public_debate_upvotes_contract$")).toBeGreaterThan(sql.lastIndexOf("GRANT "));
  });

  it("C-V cast and withdraw ask whose connection it is before they write, and answer {outcome, upvotes}; only cast asks for an active account and a public page first", () => {
    const sql = code(read(SQL_PATH));
    const cast = flat(sql, CAST);
    expect(cast).toContain(ASKS_OWNER);
    expect(inOrder(cast, ["MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'", "identity.request_owner_matches(p_owner_ref)", "account.state = 'active'",
      "MESSAGE='PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID'", `IF NOT ${PUBLIC_NOW} THEN`, "pg_catalog.jsonb_build_object('outcome', 'NOT_PUBLIC', 'upvotes', NULL::integer)",
      "INSERT INTO identity.public_debate_upvote (publication_ref, owner_ref) VALUES (p_publication_ref, p_owner_ref)",
      "ON CONFLICT (publication_ref, owner_ref) DO NOTHING", "pg_catalog.jsonb_build_object('outcome', CASE WHEN v_written = 1 THEN 'CAST' ELSE 'ALREADY' END",
      "'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref)"])).toBe(true);
    const withdraw = flat(sql, WITHDRAW);
    expect(withdraw).toContain(ASKS_OWNER);
    expect(inOrder(withdraw, ["MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'", "identity.request_owner_matches(p_owner_ref)",
      "DELETE FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref AND vote.owner_ref = p_owner_ref;",
      "pg_catalog.jsonb_build_object('outcome', CASE WHEN v_deleted = 1 THEN 'WITHDRAWN' ELSE 'NONE' END",
      `'upvotes', CASE WHEN ${PUBLIC_NOW} THEN (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = p_publication_ref) END)`])).toBe(true);
    // A person may always take their own vote back: no account state and no page state stands before the delete.
    expect(withdraw).not.toContain("account.state");
    expect(withdraw.match(/core\.run_is_published\(/gu)).toHaveLength(1);
  });

  it("C-Q the three readers: own votes behind the owner question, counts for pages public now and no owner, the export behind 0128's lease", () => {
    const sql = code(read(SQL_PATH));
    const own = flat(sql, READ_OWN);
    expect(own).toContain(ASKS_OWNER);
    expect(inOrder(own, ["COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100", "MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'",
      "identity.request_owner_matches(p_owner_ref)", "pg_catalog.array_agg(vote.publication_ref ORDER BY vote.publication_ref)",
      "WHERE vote.owner_ref = p_owner_ref AND vote.publication_ref = ANY (p_publication_refs)", "ARRAY[]::uuid[]"])).toBe(true);
    expect(own).not.toContain("run_is_published");
    const counts = flat(sql, COUNTS);
    expect(inOrder(counts, ["COALESCE(pg_catalog.cardinality(p_publication_refs), 0) > 100", "MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'",
      "pg_catalog.jsonb_build_object('publication_ref', asked.ref, 'upvotes', (SELECT pg_catalog.count(*)::integer FROM identity.public_debate_upvote AS vote WHERE vote.publication_ref = asked.ref))",
      "ORDER BY asked.ref", "SELECT DISTINCT ref FROM pg_catalog.unnest(p_publication_refs)",
      "WHERE core.run_is_published(core.run_of_publication(asked.ref), asked.ref)", "'[]'::jsonb"])).toBe(true);
    expect(counts).not.toMatch(ASKS_CONNECTION);
    expect(counts).not.toMatch(/p_owner|owner_ref/u);
    const reader = flat(sql, EXPORT_READER);
    expect(reader).toContain("BEGIN v_user := identity.data_export_lease_user(p_export_id, p_worker);");
    expect(inOrder(reader, ["identity.data_export_lease_user(p_export_id, p_worker)", "pg_catalog.jsonb_build_object('publication_ref', vote.publication_ref, 'created_at', vote.created_at)",
      "ORDER BY vote.created_at, vote.publication_ref", "WHERE vote.owner_ref = v_owner_ref", "'[]'::jsonb"])).toBe(true);
    expect(reader).not.toContain("run_is_published");
  });

  it("C-S the sweep deletes only votes of a page that is no longer its debate's current publication, in a bounded batch, and never asks whether a page is held", () => {
    const sql = code(read(SQL_PATH));
    const sweep = flat(sql, SWEEP);
    expect(inOrder(sweep, ["IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PUBLIC_DEBATE_UPVOTE_INVALID'; END IF;",
      "WITH gone AS MATERIALIZED (", "WHERE NOT core.publication_is_current(page.publication_ref)", "ORDER BY candidate.publication_ref, candidate.owner_ref",
      "LIMIT p_limit", "FOR UPDATE OF candidate SKIP LOCKED", "DELETE FROM identity.public_debate_upvote AS vote USING gone",
      "WHERE vote.publication_ref = gone.publication_ref AND vote.owner_ref = gone.owner_ref;", "GET DIAGNOSTICS v_deleted = ROW_COUNT;", "RETURN v_deleted;"])).toBe(true);
    // A held page is still current (0150's HIDE writes no visibility event). The list's rule, which a hold turns false, must not decide here.
    expect(sweep).not.toMatch(/run_is_published|public_review_held/u);
    expect(sweep.match(/core\.publication_is_current\(/gu)).toHaveLength(1);
    expect(sweep).not.toMatch(ASKS_CONNECTION);
    expect(sweep).not.toMatch(/p_owner/u);
    // The only other DELETE of the file is the withdraw's own row.
    expect(sql.match(/\bDELETE FROM\b/gu)).toHaveLength(2);
  });

  it("C-G exactly six GRANT lines, one role each: the API's role three, the cross-account marker two, the export worker one; never the runtime, authorization or erasure role", () => {
    const sql = code(read(SQL_PATH));
    expect(sql.split("\n").filter((line) => /^\s*GRANT /u.test(line))).toEqual([
      `GRANT EXECUTE ON FUNCTION ${CAST} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${WITHDRAW} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${READ_OWN} TO debateai_billing_runtime;`,
      `GRANT EXECUTE ON FUNCTION ${COUNTS} TO debateai_rls_all_accounts;`,
      `GRANT EXECUTE ON FUNCTION ${SWEEP} TO debateai_rls_all_accounts;`,
      `GRANT EXECUTE ON FUNCTION ${EXPORT_READER} TO debateai_data_export_worker;`
    ]);
    // Whole-file, not line by line: a GRANT split over two lines, indented or inside a DO block counts too.
    expect(sql.match(/\bGRANT\b/gu)).toHaveLength(6);
    expect(sql).not.toMatch(/\bGRANT\b[^;]*\bTO\s+(?:PUBLIC|debateai_runtime|debateai_authorization_runtime|debateai_erasure_runtime|debateai_replay|debateai_staff_security_owner)\b/u);
    expect(sql).not.toMatch(/\bGRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)\b/iu);
    expect(sql).toContain(`REVOKE ALL ON ${TABLE}\n  FROM ${EVERYONE}`);
    for (const signature of FUNCTIONS) expect(sql, signature).toContain(`REVOKE ALL ON FUNCTION ${signature}\n  FROM ${EVERYONE}`);
    expect(sql.match(/\bREVOKE\b/gu)).toHaveLength(7);
  });

  it("C-R is documented where the chain's steps are, and nothing of it is in the database package's pinned index", () => {
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0192, below) the eighty-second, and upvotes on public debates (0193, below) the eighty-third. A step is added",
      "(after 0193: 0193, `public-debate-upvotes-forward0193.json`, and", "0131 to 0193 keep 0130's",
      "## Upvotes on public debates (0193)", "`loadForward0193`", "MIGRATION_FORWARD0193_"]) expect(readme, needle).toContain(needle);
    expect(read("packages/db/src/index.ts")).not.toMatch(/public[-_]debate[-_]upvote|forward0193/u);
  });
});
