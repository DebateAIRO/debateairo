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
 * 0183 (owner's goal of 2026-11-11): a sign-up not finished within 24 hours is deleted. An account still pending_verification or
 * pending_mfa 24 hours after its sign-up began held its address and its name for good; the API's system login now deletes it, one
 * account a transaction under the account's own locks, and the API then destroys its key file. Expand: one new table and four new
 * functions, nothing earlier changes. The behaviour is tests/integration/unfinished-signup-expiry-database.test.ts and
 * tests/unit/unfinished-signup-expiry.test.ts.
 */
const NAME = "0183_unfinished_signup_expiry.sql";
const SQL_PATH = `migrations/${NAME}`;
const MANIFEST_PATH = "migrations/lineage/unfinished-signup-expiry-forward0183.json";
const LOADER_PATH = "packages/db/src/migration-forward0183.ts";
const PREVIOUS = "0182_mfa_recovery_control_user_started.sql";
const PREVIOUS_MANIFEST_PATH = "migrations/lineage/mfa-recovery-control-user-started-forward0182.json";
const VERIFIER_130 = "12eda800397d7da482e9b88b14b08d762ced9889214033ef8605163a8211fe57";
const TABLE = "identity.unfinished_signup_key_cleanup";
const FUNCTIONS = ["identity.read_unfinished_signups_due(integer)", "identity.expire_unfinished_signup(uuid)",
  "identity.read_unfinished_signup_key_cleanup(integer)", "identity.complete_unfinished_signup_key_cleanup(uuid)"];
const ALL_ROLES = "PUBLIC,debateai_runtime,debateai_billing_runtime,debateai_authorization_runtime,debateai_erasure_runtime,debateai_replay,debateai_data_export_worker";
const ROOT = new URL("../../", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), "utf8");
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
/** The SQL without its `--` comments (no literal of 0183 contains `--`). */
const code = (sql: string): string => sql.split("\n").map((line) => line.replace(/--.*$/u, "")).join("\n");
const bodyOf = (sql: string, name: string): string => {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  return at < 0 ? "" : sql.slice(at, sql.indexOf("$$;", sql.indexOf("AS $$", at))).replace(/\s+/gu, " ");
};

describe("0183: a sign-up not finished within 24 hours is deleted", () => {
  it("C-T is the chain step right after 0182, with its own loader and no amendment", async () => {
    const chain = read("packages/db/src/migration-forward-chain.ts");
    expect(chain).toContain("import { loadForward0183 } from './migration-forward0183.js';");
    // Not the last step any more: later steps follow it in STEPS, as 0184 does.
    expect(chain).toContain("loadForward0181,loadForward0182,loadForward0183,");
    const plan = await loadMigrationPlan();
    const names = plan.forwardChain.map((step) => step.name);
    expect(names.slice(names.indexOf(NAME) - 1, names.indexOf(NAME) + 1)).toEqual([PREVIOUS, NAME]);
    const step = plan.forwardChain.find((entry) => entry.name === NAME)!;
    expect(step.previousName).toBe(PREVIOUS);
    expect(step.verifierSha256).toBe(VERIFIER_130);
    expect(step.amendsPostconditionsOf ?? []).toEqual([]);
    expect(step.replayVerifierSql).toBeUndefined();
    const loader = read(LOADER_PATH);
    expect(loader).toContain(`const NAME='${NAME}';`);
    expect(loader).toContain("const VERSION='unfinished-signup-expiry-forward0183-v1';");
    expect(loader).toContain(`const PREVIOUS='${PREVIOUS}';`);
    expect(loader).toContain(`const TABLES=['${TABLE}'] as const;`);
    for (const signature of FUNCTIONS) expect(loader, signature).toContain(`'${signature}'`);
    expect(loader).toContain("MIGRATION_FORWARD0183_");
    expect(loader).not.toContain("0170");
  });

  it("C-M is bound to 0182's manifest and to the verifier in force (0130's, which 0182 keeps)", () => {
    const manifest = JSON.parse(read(MANIFEST_PATH)) as Record<string, unknown>;
    const previous = JSON.parse(read(PREVIOUS_MANIFEST_PATH)) as { baseRecipeSha256: string; verifier: { sha256: string } };
    expect(Object.keys(manifest)).toEqual(["version", "baseRecipeSha256", "previous", "migration", "verifier"]);
    expect(manifest).toEqual({
      version: "unfinished-signup-expiry-forward0183-v1",
      baseRecipeSha256: previous.baseRecipeSha256,
      previous: { name: PREVIOUS, manifestSha256: sha256(read(PREVIOUS_MANIFEST_PATH)), verifierSha256: VERIFIER_130 },
      migration: { name: NAME, sha256: sha256(read(SQL_PATH)) },
      verifier: { path: "lineage/verify-effective-capabilities-130.sql", sha256: VERIFIER_130 }
    });
    expect(previous.verifier.sha256).toBe(VERIFIER_130);
  });

  it("C-H says truthfully that it is expand and keeps the verifier: one new table, four new functions, nothing earlier redefined; both audits pass", async () => {
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
    expect([...definedRelationNames(sql)]).toEqual([TABLE]);
    expect([...definedFunctionNames(sql)].sort()).toEqual(FUNCTIONS.map((signature) => signature.slice(0, signature.indexOf("("))).sort());
    for (const defined of definedFunctionNames(sql)) expect(earlierFunctions.has(defined), defined).toBe(false);
    expect(earlierRelations.has(TABLE)).toBe(false);
    // Nothing earlier is altered or dropped; the only ALTERs are the owner block's, of this step's own objects.
    expect(code(sql)).not.toMatch(/^\s*(ALTER|DROP) (TABLE|FUNCTION)/mu);
    expect(code(sql)).not.toMatch(/\bCREATE (?:UNIQUE )?INDEX\b|\bCREATE TRIGGER\b|\bCREATE POLICY\b/u);
  });

  it("C-R the readers: 24 hours after the sign-up began and no link still live, the two unfinished states only, the oldest first, ids only, 1 to 1000", () => {
    const sql = code(read(SQL_PATH));
    const due = bodyOf(sql, "identity.read_unfinished_signups_due");
    expect(due).toContain("RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    expect(due).toContain("IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_INVALID'; END IF;");
    expect(due).toContain("WHERE account.state IN ('pending_verification','pending_mfa') AND account.created_at <= pg_catalog.clock_timestamp() - interval '24 hours'");
    // A link resent in the 24th hour (0096's resend, 0100's for pending_mfa) keeps its account for the link's whole life.
    expect(due).toContain("AND NOT EXISTS (SELECT 1 FROM identity.channel_binding AS channel JOIN identity.verification_token_credential AS link ON link.channel_binding_id = channel.channel_binding_id WHERE channel.user_id = account.user_id AND link.expires_at > pg_catalog.clock_timestamp())");
    expect(due).toContain("ORDER BY account.created_at, account.user_id LIMIT p_limit");
    expect(due).not.toMatch(/email|pseudonym|password|ciphertext|owner_ref|audit_token/u);
    const owed = bodyOf(sql, "identity.read_unfinished_signup_key_cleanup");
    expect(owed).toContain("RETURNS uuid[] LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    expect(owed).toContain("WHERE NOT EXISTS (SELECT 1 FROM identity.\"user\" AS account WHERE account.user_id = cleanup.user_id)");
    expect(owed).toContain("ORDER BY cleanup.expired_at, cleanup.user_id LIMIT p_limit");
  });

  it("C-D the delete: the account's locks first, the state, the age and the links asked again after them on the database's clock, the audit row and the owed key before the row goes", () => {
    const body = bodyOf(code(read(SQL_PATH)), "identity.expire_unfinished_signup");
    expect(body).toContain("RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
    const order = [
      "FROM identity.lock_account_t9_internal(p_user_id, false) AS account;",
      "IF v_audit_token IS NULL THEN RETURN 'NOT_DUE'; END IF;",
      "v_now := pg_catalog.clock_timestamp();",
      "SELECT account.created_at INTO v_created_at FROM identity.\"user\" AS account WHERE account.user_id = p_user_id;",
      "IF v_state IS NULL OR v_state NOT IN ('pending_verification','pending_mfa') OR v_created_at IS NULL OR v_created_at > v_now - interval '24 hours'",
      "OR EXISTS (SELECT 1 FROM identity.channel_binding AS channel JOIN identity.verification_token_credential AS link ON link.channel_binding_id = channel.channel_binding_id WHERE channel.user_id = p_user_id AND link.expires_at > v_now) THEN RETURN 'NOT_DUE'; END IF;",
      "PERFORM identity.append_audit_event_internal(",
      "'identity.registration.expired'",
      "'SIGNUP_NOT_FINISHED_WITHIN_24_HOURS'",
      "INSERT INTO identity.unfinished_signup_key_cleanup AS cleanup (user_id, expired_at) VALUES (p_user_id, v_now) ON CONFLICT (user_id) DO NOTHING;",
      "DELETE FROM identity.\"user\" AS account WHERE account.user_id = p_user_id;",
      "RETURN 'EXPIRED';"
    ];
    let cursor = -1;
    for (const needle of order) {
      const at = body.indexOf(needle, cursor + 1);
      expect(at, needle).toBeGreaterThan(cursor);
      cursor = at;
    }
    // The caller hands it an id and nothing else: no clock, no state, no limit of its own.
    expect(body).toContain("identity.expire_unfinished_signup(p_user_id uuid)");
    // Never a state an account can be in once it was active.
    expect(body).not.toMatch(/'active'|'suspended'|'deleted'|'age_frozen'/u);
    const complete = bodyOf(code(read(SQL_PATH)), "identity.complete_unfinished_signup_key_cleanup");
    expect(complete).toContain("DELETE FROM identity.unfinished_signup_key_cleanup AS cleanup WHERE cleanup.user_id = p_user_id AND NOT EXISTS (SELECT 1 FROM identity.\"user\" AS account WHERE account.user_id = cleanup.user_id);");
    expect(complete).toContain("RETURN FOUND;");
  });

  it("C-G owned by the owner of 0110's account delete, which the step checks may do its work; revoked from every role first, then granted to the cross-account marker alone, never the erasure login", () => {
    const sql = code(read(SQL_PATH));
    expect(read(SQL_PATH)).toMatch(/^-- n1: reviewed sets the owner of the objects this step creates and checks what that owner may do; the release before reads none of them\.\nDO \$unfinished_signup_expiry_owner\$$/mu);
    expect(sql).toContain("WHERE p.oid = 'identity.finalize_account_erasure(uuid,timestamptz,timestamptz,integer,integer,integer,integer)'::regprocedure;");
    expect(sql).toContain(`EXECUTE pg_catalog.format('ALTER TABLE ${TABLE} OWNER TO %I', v_owner);`);
    for (const signature of FUNCTIONS) expect(sql, signature).toContain(`EXECUTE pg_catalog.format('ALTER FUNCTION ${signature} OWNER TO %I', v_owner);`);
    for (const needle of ["has_table_privilege(v_owner, 'identity.\"user\"', 'SELECT')", "has_table_privilege(v_owner, 'identity.\"user\"', 'DELETE')",
      "has_table_privilege(v_owner, 'identity.channel_binding', 'SELECT')", "has_table_privilege(v_owner, 'identity.verification_token_credential', 'SELECT')",
      "has_function_privilege(v_owner, 'identity.lock_account_t9_internal(uuid,boolean)', 'EXECUTE')",
      "'identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text)', 'EXECUTE')",
      "RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='UNFINISHED_SIGNUP_EXPIRY_OWNER_UNABLE';"]) expect(sql, needle).toContain(needle);
    const flat = sql.replace(/\s+/gu, " ");
    expect(flat).toContain(`REVOKE ALL ON TABLE ${TABLE} FROM ${ALL_ROLES};`);
    expect(flat).toContain(`REVOKE ALL ON FUNCTION ${FUNCTIONS.join(", ")} FROM ${ALL_ROLES};`);
    expect([...flat.matchAll(/GRANT ([^;]*);/gu)].map((match) => match[1])).toEqual([`EXECUTE ON FUNCTION ${FUNCTIONS.join(", ")} TO debateai_rls_all_accounts`]);
    // The erasure login's exact boot list is untouched: one more function there would stop the release before from restarting beside the step.
    const erasure = read("packages/db/src/account-erasure.ts");
    expect(erasure.slice(erasure.indexOf("const ERASURE_FUNCTION_SIGNATURES"), erasure.indexOf("const ERASURE_FORBIDDEN_ROLES"))).not.toContain("unfinished_signup");
  });

  it("C-W the API runs it outside any request, on its pool, from its own gated timer, and reaches the database only through the four functions", () => {
    const repository = read("packages/db/src/unfinished-signup-expiry.ts");
    for (const call of ['"SELECT identity.read_unfinished_signups_due($1::integer)::text[] AS due"', '"SELECT identity.expire_unfinished_signup($1::uuid) AS outcome"',
      '"SELECT identity.read_unfinished_signup_key_cleanup($1::integer)::text[] AS owed"', '"SELECT identity.complete_unfinished_signup_key_cleanup($1::uuid) AS taken"']) {
      expect(repository, call).toContain(call);
    }
    expect([...repository.matchAll(/\.query</gu)]).toHaveLength(4);
    const main = read("apps/api/src/main.ts");
    expect(main).toContain("new PostgresUnfinishedSignupExpiryRepository(pool)");
    expect(main).not.toContain("new PostgresUnfinishedSignupExpiryRepository(erasurePool)");
    expect(main).toContain("const unfinishedSignupExpiryTimer=gatedInterval(releaseWatcher,triggerUnfinishedSignupExpiry,UNFINISHED_SIGNUP_EXPIRY_EVERY_MS);");
    // packages/db/src/index.ts is not touched (its bytes are pinned): the repository is imported by its path.
    expect(main).toContain('import { PostgresUnfinishedSignupExpiryRepository } from "../../../packages/db/src/unfinished-signup-expiry.js";');
    expect(read("packages/db/src/index.ts")).not.toContain("unfinished-signup-expiry");
  });

  it("C-L is documented and listed", () => {
    const corpus = read("tests/support/shipped-corpus.manifest.txt").split("\n");
    for (const path of [LOADER_PATH, "packages/db/src/unfinished-signup-expiry.ts", "apps/api/src/unfinished-signup-expiry.ts"]) expect(corpus, path).toContain(path);
    const readme = read("migrations/lineage/README.md").replace(/\s+/gu, " ");
    for (const needle of ["(0183, below) the seventy-third", "## A sign-up not finished within 24 hours is deleted (0183)", "`loadForward0183`",
      "MIGRATION_FORWARD0183_", "`-- n1: expand`", "`unfinished-signup-expiry-forward0183.json`", ...FUNCTIONS.map((signature) => `\`${signature}\``)]) expect(readme, needle).toContain(needle);
    expect(read("deploy/preview-auth-dev/v1/README.md"))
      .toContain("`migrations/0183_unfinished_signup_expiry.sql` (after `0182_mfa_recovery_control_user_started.sql`, `n1: expand`)");
    const principals = JSON.parse(read("docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json")) as {
      privilegeDisclosures: Array<{ roleName: string; source: string; grants: string[] }> };
    expect(principals.privilegeDisclosures.filter((entry) => entry.source === SQL_PATH))
      .toEqual([{ roleName: "debateai_rls_all_accounts", source: SQL_PATH, grants: FUNCTIONS.map((signature) => `EXECUTE ON FUNCTION ${signature}`) }]);
  });
});
