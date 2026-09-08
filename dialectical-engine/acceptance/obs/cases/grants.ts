import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";
import { Pool } from "pg";

export interface GrantFactInput {
  readonly roleNames: readonly string[];
  readonly productUrl: string;
  readonly roleUrls: readonly string[];
  readonly grants: readonly Readonly<{
    grantee: string;
    table_schema: string;
    table_name: string;
    privilege_type: string;
  }>[];
  readonly listenerDetail: boolean;
  readonly listenerCoreRun: boolean;
}

export function evaluateGrantFacts(
  input: GrantFactInput,
): Readonly<{ passed: boolean; violations: readonly string[] }> {
  const violations = new Set<string>();
  const expectedRoles = [
    "debateai_obs_writer",
    "debateai_obs_listener",
    "debateai_obs_watchdog",
    "debateai_obs_human",
  ];
  if (expectedRoles.some((role, index) => input.roleNames[index] !== role)) {
    violations.add("ROLE_IDENTITY_MISMATCH");
  }
  if (input.listenerDetail) violations.add("LISTENER_DETAIL_GRANT");
  if (input.listenerCoreRun) violations.add("LISTENER_CORE_RUN_GRANT");
  if (input.grants.some((grant) =>
    grant.grantee === "debateai_obs_listener" && grant.table_schema === "identity"
  )) violations.add("LISTENER_IDENTITY_GRANT");
  if (input.grants.some((grant) => grant.privilege_type === "DELETE")) {
    violations.add("DELETE_GRANT");
  }
  if (input.roleUrls.some((url) => url === input.productUrl)) {
    violations.add("PRODUCT_URL_REUSED");
  }
  const ordered = [
    "DELETE_GRANT",
    "LISTENER_CORE_RUN_GRANT",
    "LISTENER_DETAIL_GRANT",
    "LISTENER_IDENTITY_GRANT",
    "PRODUCT_URL_REUSED",
    "ROLE_IDENTITY_MISMATCH",
  ].filter((value) => violations.has(value));
  return Object.freeze({ passed: ordered.length === 0, violations: Object.freeze(ordered) });
}

const ROLE_INPUTS = Object.freeze([
  ["debateai_obs_writer", "OBS_WRITER_DATABASE_URL"],
  ["debateai_obs_listener", "OBS_LISTENER_DATABASE_URL"],
  ["debateai_obs_watchdog", "OBS_WATCHDOG_DATABASE_URL"],
  ["debateai_obs_human", "OBS_HUMAN_DATABASE_URL"],
] as const);

async function queryRole(url: string): Promise<Readonly<{
  roleName: string;
  grants: GrantFactInput["grants"];
  listenerDetail: boolean;
  listenerCoreRun: boolean;
}>> {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 2_000, statement_timeout: 2_000 });
  try {
    const identity = await pool.query<{ role_name: string }>("SELECT current_user::text AS role_name");
    const grants = await pool.query<GrantFactInput["grants"][number]>(`
      SELECT grantee, table_schema, table_name, privilege_type
        FROM information_schema.role_table_grants
       WHERE grantee = current_user
       ORDER BY table_schema, table_name, privilege_type
    `);
    const privileges = await pool.query<{ detail: boolean; core_run: boolean }>(`
      SELECT has_table_privilege(current_user, 'obs.occurrence_detail', 'SELECT') AS detail,
             has_table_privilege(current_user, 'core.run', 'SELECT') AS core_run
    `);
    return Object.freeze({
      roleName: identity.rows[0]?.role_name ?? "",
      grants: Object.freeze(grants.rows.map((row) => Object.freeze({ ...row }))),
      listenerDetail: privileges.rows[0]?.detail === true,
      listenerCoreRun: privileges.rows[0]?.core_run === true,
    });
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export const grantsCase: ObsAcceptanceCase = Object.freeze({
  name: "grants",
  subjectPaths: Object.freeze(["migrations/0034_obs_foundation.sql"]),
  async run(context: ObsCaseContext) {
    const productUrl = process.env.DATABASE_URL?.trim();
    if (!productUrl) return context.skipMissing("DATABASE_URL");
    const roleUrls: string[] = [];
    for (const [, key] of ROLE_INPUTS) {
      const value = process.env[key]?.trim();
      if (!value) return context.skipMissing(key);
      roleUrls.push(value);
    }
    try {
      const facts = await Promise.all(roleUrls.map((url) => queryRole(url)));
      const listener = facts[1];
      const evaluation = evaluateGrantFacts({
        roleNames: facts.map((fact) => fact.roleName),
        productUrl,
        roleUrls,
        grants: facts.flatMap((fact) => fact.grants),
        listenerDetail: listener?.listenerDetail ?? true,
        listenerCoreRun: listener?.listenerCoreRun ?? true,
      });
      if (!evaluation.passed) {
        return context.fail("GRANT_ASSERTION_FAILED", { violations: evaluation.violations.length });
      }
      const receipt = await context.spawn({
        command: process.execPath,
        arguments: ["-e", "process.exit(0)"],
        timeoutMs: 2_000,
      });
      return context.passProcess(receipt, {
        assertions: 4,
        grants: facts.reduce((sum, fact) => sum + fact.grants.length, 0),
        roles: facts.length,
      });
    } catch {
      return context.fail("GRANT_PROBE_UNAVAILABLE", { failures: 1 });
    }
  },
});
