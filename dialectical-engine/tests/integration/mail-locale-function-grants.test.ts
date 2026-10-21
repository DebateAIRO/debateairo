import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Mission email-locale, S01-C23 (ARCH-FIX-S01-r4c4 charge 1, D-131). Migration 0116 creates identity.require_mail_locale() as a
 * trigger function; it must not be executable by PUBLIC or by any product role (the erasure worker's exact-privilege witness
 * counts every identity EXECUTE). The two erasure readers 0116 grants are executable by the erasure role only. The five guard
 * triggers stay installed: a trigger fires without the caller holding EXECUTE, so the refusal does not depend on the grant.
 */
// S-N1 (REV-S01-p1-security §N1): every role the migrations create, not five of them: the literal `CREATE ROLE` statements
// of migrations/*.sql plus the format() loop of 0034_obs_foundation.sql (the four obs roles). C23.4e fails when the migrated
// database holds a debateai_ role that this list does not name.
const PRODUCT_ROLES = [
  "debateai_authorization_runtime",
  "debateai_backup_email_owner",
  "debateai_backup_email_runtime",
  "debateai_billing_runtime",
  "debateai_content_provision",
  "debateai_data_export_worker",
  "debateai_erasure_runtime",
  "debateai_evaluator_api",
  "debateai_evaluator_ddl",
  "debateai_evaluator_reader",
  "debateai_evaluator_worker",
  "debateai_mfa_recovery_owner",
  "debateai_mfa_recovery_runtime",
  "debateai_obs_human",
  "debateai_obs_listener",
  "debateai_obs_stats_owner",
  "debateai_obs_view_owner",
  "debateai_obs_watchdog",
  "debateai_obs_writer",
  "debateai_observation_agent",
  "debateai_observation_threshold_operator",
  "debateai_password_recovery_owner",
  "debateai_password_recovery_runtime",
  "debateai_password_reset_owner",
  "debateai_password_reset_runtime",
  "debateai_prod_staff_recovery",
  "debateai_publication_cleanup",
  "debateai_register_publication_owner",
  // Side-by-side releases (0123 §3): the release table's function owner and its writers' operator group.
  "debateai_release_operator",
  "debateai_release_owner",
  "debateai_replay",
  "debateai_runtime",
  "debateai_settlement_watch",
  "debateai_staff_readiness_writer",
  "debateai_staff_recovery",
  "debateai_staff_security_owner",
  "debateai_support",
  "debateai_support_config_operator"
] as const;

let db: TestDatabase;
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
}, 300_000);
afterAll(async () => { await db?.stop(); });

it("C23.4a identity.require_mail_locale() has no PUBLIC EXECUTE (the default PUBLIC grant is revoked in 0116)", async () => {
  const row = (await db.pool.query<{ public_execute: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = 'identity.require_mail_locale()'::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_execute`)).rows[0]!;
  expect(row.public_execute).toBe(false);
});

it("C23.4b no product role can execute identity.require_mail_locale() (the guard function is trigger-only)", async () => {
  for (const role of PRODUCT_ROLES) {
    const row = (await db.pool.query<{ allowed: boolean }>(
      "SELECT has_function_privilege($1, 'identity.require_mail_locale()', 'EXECUTE') AS allowed", [role]
    )).rows[0]!;
    expect(row.allowed, role).toBe(false);
  }
});

it("C23.4c the two 0116 erasure readers are executable by debateai_erasure_runtime and by no other product role", async () => {
  for (const signature of ["identity.account_erasure_notification_mail_locale(uuid,uuid)", "identity.account_erasure_schedule_locale(uuid)"]) {
    for (const role of PRODUCT_ROLES) {
      const row = (await db.pool.query<{ allowed: boolean }>(
        "SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS allowed", [role, signature]
      )).rows[0]!;
      expect(row.allowed, `${role} ${signature}`).toBe(role === "debateai_erasure_runtime");
    }
  }
});

it("C23.4d the five guard triggers stay installed on the five queued-mail tables", async () => {
  const row = (await db.pool.query<{ n: number }>(`
    SELECT count(*)::int AS n FROM pg_trigger t
    WHERE t.tgfoid = 'identity.require_mail_locale()'::regprocedure AND NOT t.tgisinternal`)).rows[0]!;
  expect(row.n).toBe(5);
});

it("C23.4e every debateai_ role the migrated database holds is named in PRODUCT_ROLES (a new role is listed here or fails)", async () => {
  const rows = (await db.pool.query<{ rolname: string }>(
    "SELECT rolname FROM pg_roles WHERE starts_with(rolname, 'debateai_') ORDER BY rolname"
  )).rows;
  const unlisted = rows.map((row) => row.rolname).filter((name) => !(PRODUCT_ROLES as readonly string[]).includes(name));
  expect(unlisted).toEqual([]);
});
