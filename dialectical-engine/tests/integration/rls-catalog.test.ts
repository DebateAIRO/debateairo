/**
 * Row-level security S01, cluster C6, step S6.4 (PLAN.md S6.4; SPEC-v4 R15, R16, R17, R19(a), R36; DECISIONS D29, D30,
 * D34, D47). The catalog facts that keep row security from being widened by who a T1 login is, read with the four T1
 * logins provisioned by the product's own provisioners (dev: apps/runner/src/dev-database-principals.ts; production:
 * apps/runner/src/production-database-principals.ts), so the reference check reaches policies through the logins
 * themselves (SPEC-v4 R15 (a)) and not only through the T2 roles.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { DEVELOPMENT_DATABASE_PRINCIPALS } from "../../apps/runner/src/dev-database-principals.js";
import { rlsRelationSql } from "../../tools/rls/seed.js";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import { RLS_ALL_ACCOUNTS_ROLES, RLS_ALLOW_LIST, RLS_IN_SCOPE } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * `.hermes/reports/row-level-security/probes/REQ-FIX-RLS-2/policy-reach-v3.sql`, verbatim (SPEC-v4 R15, R36: "or a
 * copy"); its sha256 at the time of copying is POLICY_REACH_V3_SHA256, which the first case re-measures on this text.
 */
const POLICY_REACH_V3_SQL = String.raw`-- REQ-FIX-RLS-2 reference check for SPEC-v3 R15 (mission row-level-security, 2026-10-23); supersedes
-- probes/REQ-FIX-RLS-1/policy-reach.sql, which reached a login only through the T2 roles (REQ-REV-p2 N1).
-- A policy REACHES a T1 login when its roles contain PUBLIC (oid 0, a policy written without TO), or a role r such that
--   (a) a T1 login present in pg_roles is a member of r (pg_has_role(login, r, 'MEMBER') — covers TO the login itself
--       and TO any role granted to it, directly or through others), or
--   (b) a T2 role is a member of r (for a database where the logins are not provisioned yet).
-- T1 = the four API logins of SPEC-v3 T1. T2 below is the base set; at head, list the directMemberships of api-runtime
-- and api-authorization in the principal manifest (SPEC-v3 T2). Every output row must be on DECISIONS.md's allow-list.
WITH t1(role) AS (VALUES ('debateai_prod_api_runtime'), ('debateai_prod_api_authorization'),
                        ('debateai_dev_runtime'), ('debateai_dev_authorization')),
t1_present AS (SELECT role FROM t1 WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = t1.role)),
t2(role) AS (VALUES ('debateai_billing_runtime'), ('debateai_authorization_runtime'))
SELECT n.nspname AS schema, c.relname AS relation, p.polname AS policy, p.polcmd::text AS cmd, p.polpermissive AS permissive,
       CASE WHEN 0 = ANY (p.polroles) THEN 'PUBLIC' ELSE array_to_string(ARRAY(SELECT pg_get_userbyid(r) FROM unnest(p.polroles) r ORDER BY 1), ',') END AS roles,
       pg_get_expr(p.polqual, p.polrelid) AS using_expr, pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE 0 = ANY (p.polroles)
   OR EXISTS (SELECT 1 FROM unnest(p.polroles) r, t1_present WHERE r <> 0 AND pg_has_role(t1_present.role, r, 'MEMBER'))
   OR EXISTS (SELECT 1 FROM unnest(p.polroles) r, t2 WHERE r <> 0 AND pg_has_role(t2.role, r, 'MEMBER'))
ORDER BY 1, 2, 3;
`;
const POLICY_REACH_V3_SHA256 = "55436fd7ca096916bff91a88cdee16e7cf040e98647f1e1e863d58aa06839544";
const T1_LOGINS = Object.freeze(["debateai_prod_api_runtime", "debateai_prod_api_authorization", "debateai_dev_runtime",
  "debateai_dev_authorization"]);
const MANIFEST_PATH = fileURLToPath(new URL(
  "../../docs/missions/2026-08-17-accounts-privacy-security/P3-01-production-database-principals.json", import.meta.url));

type ManifestRole = Readonly<{ id?: string; roleName: string; forbiddenMemberships?: readonly string[] }>;
type Manifest = Readonly<{ principals: readonly ManifestRole[]; capabilityRoles: readonly ManifestRole[];
  ownershipRoles: readonly ManifestRole[]; provisioner: Readonly<{ managedPrincipalIds: readonly string[] }> }>;

let database: TestDatabase;
let logins: RlsLogins;
let manifest: Manifest;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  await logins.production();
  manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as Manifest;
}, 600_000);

afterAll(async () => {
  await logins?.end();
  await database?.stop();
});

describe("row-level security S01 C6: the catalog keeps every T1 login inside its own account", () => {
  it("S6.4-a R15 a verbatim copy of probes/REQ-FIX-RLS-2/policy-reach-v3.sql, run with the 4 T1 logins provisioned, prints texts whose set EQUALS RLS_ALLOW_LIST (39)", async () => {
    expect(createHash("sha256").update(POLICY_REACH_V3_SQL).digest("hex")).toBe(POLICY_REACH_V3_SHA256);
    const present = (await database.pool.query("SELECT rolname FROM pg_roles WHERE rolname = ANY ($1::text[]) ORDER BY 1",
      [T1_LOGINS])).rows.map((row) => row.rolname as string);
    expect(present).toEqual([...T1_LOGINS].sort());
    const rows = (await database.pool.query(POLICY_REACH_V3_SQL)).rows as { using_expr: string | null; check_expr: string | null }[];
    const texts = [...new Set(rows.flatMap((row) => [row.using_expr, row.check_expr]).filter((text): text is string => text !== null))];
    expect(RLS_ALLOW_LIST).toHaveLength(39);
    expect(texts.sort()).toEqual([...RLS_ALLOW_LIST].sort());
  });

  it("S6.4-b R16 no T1 login, nor any role it is a member of, has rolbypassrls or rolsuper or owns an in-scope relation", async () => {
    const scope = RLS_IN_SCOPE.map(({ relation }) => rlsRelationSql(relation));
    const rows = (await database.pool.query(`SELECT l.login, r.rolname, r.rolsuper, r.rolbypassrls,
        ARRAY(SELECT c.oid::regclass::text FROM pg_class c WHERE c.relowner = r.oid
          AND c.oid = ANY (SELECT unnest($2::text[])::regclass) ORDER BY 1) AS owns
      FROM unnest($1::text[]) AS l(login) JOIN pg_roles r ON pg_has_role(l.login, r.oid, 'MEMBER') ORDER BY 1, 2`,
    [T1_LOGINS, scope])).rows as { login: string; rolname: string; rolsuper: boolean; rolbypassrls: boolean; owns: string[] }[];
    expect(new Set(rows.map(({ login }) => login)).size).toBe(4);
    expect(rows.some(({ rolname }) => rolname === "debateai_runtime")).toBe(true);
    const failures = rows.filter((row) => row.rolsuper || row.rolbypassrls || row.owns.length > 0)
      .map((row) => `RLS_FAIL ${row.login} ${row.rolname} R16 super=${row.rolsuper} bypassrls=${row.rolbypassrls} owns=${row.owns.join(",")}`);
    expect(failures).toEqual([]);
  });

  it("S6.4-c R19(a) both API principals' forbiddenMemberships contain every RLS_ALL_ACCOUNTS_ROLES role, and no T1 login is a member of any", async () => {
    const forbidden = (id: string): readonly string[] => manifest.principals.find((principal) => principal.id === id)?.forbiddenMemberships ?? [];
    const missing = ["api-runtime", "api-authorization"].flatMap((id) => RLS_ALL_ACCOUNTS_ROLES
      .filter((role) => !forbidden(id).includes(role)).map((role) => `RLS_FAIL manifest ${id} R19 forbiddenMemberships-missing=${role}`));
    expect(RLS_ALL_ACCOUNTS_ROLES).toHaveLength(11);
    const memberships = (await database.pool.query(`SELECT l.login, r.role, pg_has_role(l.login, r.role, 'MEMBER') AS member
      FROM unnest($1::text[]) AS l(login) CROSS JOIN unnest($2::text[]) AS r(role) ORDER BY 1, 2`,
    [T1_LOGINS, RLS_ALL_ACCOUNTS_ROLES])).rows as { login: string; role: string; member: boolean }[];
    expect(memberships).toHaveLength(44);
    const held = memberships.filter(({ member }) => member).map(({ login, role }) => `RLS_FAIL ${login} ${role} R19 member`);
    expect([...missing, ...held]).toEqual([]);
  });

  it("S6.4-d R17 rolconfig is null for every role of the P3-01 manifest and of DEVELOPMENT_DATABASE_PRINCIPALS", async () => {
    const managed = new Set(manifest.provisioner.managedPrincipalIds);
    // Roles the migrations or the two provisioners create, so each must exist here; the manifest's other principals
    // (not managed by the provisioner) are checked where they exist and named where they do not.
    const required = [...new Set([
      ...manifest.principals.filter(({ id }) => id !== undefined && managed.has(id)).map(({ roleName }) => roleName),
      ...[...manifest.capabilityRoles, ...manifest.ownershipRoles].map(({ roleName }) => roleName),
      ...DEVELOPMENT_DATABASE_PRINCIPALS.flatMap((principal) => [principal.roleName, principal.capabilityRole,
        ...("crossAccountRole" in principal && principal.crossAccountRole !== undefined ? [principal.crossAccountRole] : [])])
    ])].sort();
    const names = [...new Set([...required, ...manifest.principals.map(({ roleName }) => roleName)])].sort();
    const rows = (await database.pool.query("SELECT rolname, rolconfig FROM pg_roles WHERE rolname = ANY ($1::text[]) ORDER BY 1",
      [names])).rows as { rolname: string; rolconfig: string[] | null }[];
    const exists = (name: string): boolean => rows.some(({ rolname }) => rolname === name);
    expect({ missing: required.filter((name) => !exists(name)) }).toEqual({ missing: [] });
    console.info(`R17 FRAME roles_checked=${rows.length} absent_unmanaged=${names.filter((name) => !exists(name)).join(",") || "none"}`);
    expect(rows.filter(({ rolconfig }) => rolconfig !== null).map(({ rolname, rolconfig }) => `RLS_FAIL ${rolname} R17 rolconfig=${JSON.stringify(rolconfig)}`))
      .toEqual([]);
  });
});
