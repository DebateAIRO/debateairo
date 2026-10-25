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

/**
 * SEC-B1's class (REV-S01-p1-security §2 B1, V-15): a per-account check that a row the requester may write can meet. An
 * `rls_account` predicate is ANCHORED when it compares the row's own account key with the verified context, or calls a
 * context function over the trust anchors (SPEC-v4 T8; the forgery families of rls-forgery.test.ts); otherwise it is a PARENT check,
 * `EXISTS (SELECT 1 FROM <parent> p WHERE p.<col> = <child>.<col> AND …)`, whose subquery sees the parent rows the
 * context owns. A parent check holds only when no T1 login can make an own parent row that matches another account's
 * child row: the compared parent columns hold a unique key, every child row has its parent by a validated foreign key
 * (so no child row waits for a parent a requester could insert with a chosen key), no T1 login re-keys the parent, and
 * the parent's own check holds.
 */
const ANCHORED_CHECK = /^(?:\((?:owner_ref|user_id) = \( SELECT rls\.context_(?:owner_ref|user_id)\(\) AS context_(?:owner_ref|user_id)\)\)|false|rls\.owns_run\([a-z0-9_]+\)|rls\.owns_execution_ref\([a-z0-9_]+\))$/u;
const PARENT_CHECK = /^\(EXISTS \( SELECT 1\n {3}FROM ([a-z0-9_]+\.[a-z0-9_]+) p\n {2}WHERE (.+)\)\)$/su;
const PARENT_PAIR = /\(p\.([a-z0-9_]+) = ([a-z0-9_]+)\.([a-z0-9_]+)\)/gu;

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

/**
 * FIX-S01-p1a NEW-1 (measured 2026-10-25 on debateai_dev_runtime and debateai_prod_api_runtime, A's live credential: an
 * unmatched payment_notice, its outcome, an unmatched notice_quarantine row and a card_token_revocation whose token
 * 0111's purge_revoked_card_tokens deleted each became readable, 0 → 1, once A inserted an own parent row carrying the
 * key). Its parent keys are unique, so no duplicate is possible; the child rows simply need no parent row. The remedy
 * (a foreign key, or an owner column filled by the NETOPIA writers) is outside FIX-S01-p1a's contract, so the set is
 * pinned here: a new member, or a fixed one, moves it.
 */
const ORPHAN_CLAIM_RESIDUE: readonly string[] = Object.freeze([
  "billing.card_token",
  "billing.card_token_revocation",
  "billing.notice_quarantine",
  "billing.payment_notice",
  "billing.payment_notice_outcome via billing.payment_notice",
  "billing.payment_notice_raw via billing.payment_notice"
]);

type ClassVerdict = Readonly<{ kind: "ANCHORED" | "HOLDS" | "NON_UNIQUE" | "REKEY" | "ORPHAN" | "UNRECOGNIZED"; via?: string }>;
let swept: Promise<Readonly<{ verdicts: ReadonlyMap<string, ClassVerdict>; unrecognized: readonly string[] }>> | undefined;

/** SEC-B1's class, member by member (one line per parent check), computed once from the catalog at head. */
function classSweep(): Promise<Readonly<{ verdicts: ReadonlyMap<string, ClassVerdict>; unrecognized: readonly string[] }>> {
  swept ??= (async () => {
    const tables = RLS_IN_SCOPE.filter(({ kind }) => kind === "r").map(({ relation }) => relation);
    const checks = new Map((await database.pool.query(`SELECT relation, pg_get_expr(p.polqual, p.polrelid) AS using_expr
      FROM unnest($1::text[]) AS relation JOIN pg_policy p ON p.polrelid = to_regclass(CASE WHEN relation = 'identity.user'
        THEN 'identity."user"' ELSE relation END) AND p.polname = 'rls_account'`, [tables])).rows
      .map((row) => [row.relation as string, row.using_expr as string] as const));
    expect([...checks.keys()].sort()).toEqual([...tables].sort());
    const verdicts = new Map<string, ClassVerdict>();
    const unrecognized: string[] = [];
    const verdictOf = async (child: string): Promise<ClassVerdict> => {
      const known = verdicts.get(child);
      if (known !== undefined) return known;
      const text = checks.get(child);
      const settle = (verdict: ClassVerdict): ClassVerdict => { verdicts.set(child, verdict); return verdict; };
      if (text !== undefined && ANCHORED_CHECK.test(text)) return settle({ kind: "ANCHORED" });
      const parsed = text === undefined ? null : PARENT_CHECK.exec(text);
      const pairs = parsed === null ? [] : [...parsed[2]!.matchAll(PARENT_PAIR)].map((m) => ({ parent: m[1]!, alias: m[2]!, child: m[3]! }));
      if (parsed === null || pairs.length === 0 || pairs.some(({ alias }) => alias !== child.split(".")[1])
        || parsed[2]!.replaceAll(PARENT_PAIR, "").replace(/^\(|\)$/gu, "").split(" AND ").some((rest) => rest !== "")) {
        unrecognized.push(`${child} ${JSON.stringify(text)}`);
        return settle({ kind: "UNRECOGNIZED" });
      }
      const parent = parsed[1]!;
      const facts = (await database.pool.query(`SELECT
          (SELECT string_agg(i.indexrelid::regclass::text, ',' ORDER BY 1) FROM pg_index i
            WHERE i.indrelid = $1::regclass AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
              AND (SELECT bool_and(a.attname = ANY ($2::text[])) FROM unnest(i.indkey::int2[]) AS k(attnum)
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)) AS unique_keys,
          (SELECT string_agg(k.conname, ',' ORDER BY 1) FROM pg_constraint k
            WHERE k.contype = 'f' AND k.convalidated AND k.conrelid = $3::regclass AND k.confrelid = $1::regclass
              AND (SELECT bool_and(pa.attname || '=' || ca.attname = ANY ($4::text[])) FROM unnest(k.conkey, k.confkey) AS u(ck, pk)
                JOIN pg_attribute ca ON ca.attrelid = k.conrelid AND ca.attnum = u.ck
                JOIN pg_attribute pa ON pa.attrelid = k.confrelid AND pa.attnum = u.pk)) AS foreign_keys,
          (SELECT string_agg(l, ',' ORDER BY 1) FROM unnest($5::text[]) AS l
            WHERE has_table_privilege(l, $1::regclass, 'INSERT') OR has_any_column_privilege(l, $1::regclass, 'INSERT')) AS inserters,
          (SELECT string_agg(l || ':' || col, ',' ORDER BY 1) FROM unnest($5::text[]) AS l CROSS JOIN unnest($2::text[]) AS col
            WHERE has_column_privilege(l, $1::regclass, col, 'UPDATE')) AS rekeyers`,
      [parent, pairs.map((pair) => pair.parent), rlsRelationSql(child), pairs.map((pair) => `${pair.parent}=${pair.child}`),
        T1_LOGINS])).rows[0] as { unique_keys: string | null; foreign_keys: string | null; inserters: string | null; rekeyers: string | null };
      const upstream = await verdictOf(parent);
      // A parent key no unique index covers lets a T1 login that inserts the parent duplicate another account's key
      // (SEC-B1); a child row with no foreign key to its parent can wait for a parent a T1 login inserts with that key.
      const verdict: ClassVerdict = facts.unique_keys === null && facts.inserters !== null ? { kind: "NON_UNIQUE" }
        : facts.rekeyers !== null ? { kind: "REKEY" }
        : facts.foreign_keys === null && facts.inserters !== null ? { kind: "ORPHAN" }
        : upstream.kind === "ANCHORED" || upstream.kind === "HOLDS" ? { kind: "HOLDS" }
        : { kind: upstream.kind, via: parent };
      console.info(`SEC-B1 CLASS child=${child} parent=${parent} pairs=${pairs.map((pair) => `p.${pair.parent}=c.${pair.child}`).join("&")} `
        + `unique=${facts.unique_keys ?? "NO"} fk=${facts.foreign_keys ?? "NO"} t1_insert_parent=${facts.inserters ?? "none"} `
        + `t1_rekey_parent=${facts.rekeyers ?? "none"} parent_check=${upstream.kind} verdict=${verdict.kind}${verdict.via === undefined ? "" : `:via-${verdict.via}`}`);
      return settle(verdict);
    };
    for (const table of tables) await verdictOf(table);
    return Object.freeze({ verdicts, unrecognized: Object.freeze([...unrecognized]) });
  })();
  return swept;
}

describe("row-level security S01 C6: the catalog keeps every T1 login inside its own account", () => {
  it("S6.4-a R15 a verbatim copy of probes/REQ-FIX-RLS-2/policy-reach-v3.sql, run with the 4 T1 logins provisioned, prints texts whose set EQUALS RLS_ALLOW_LIST (38)", async () => {
    expect(createHash("sha256").update(POLICY_REACH_V3_SQL).digest("hex")).toBe(POLICY_REACH_V3_SHA256);
    const present = (await database.pool.query("SELECT rolname FROM pg_roles WHERE rolname = ANY ($1::text[]) ORDER BY 1",
      [T1_LOGINS])).rows.map((row) => row.rolname as string);
    expect(present).toEqual([...T1_LOGINS].sort());
    const rows = (await database.pool.query(POLICY_REACH_V3_SQL)).rows as { using_expr: string | null; check_expr: string | null }[];
    const texts = [...new Set(rows.flatMap((row) => [row.using_expr, row.check_expr]).filter((text): text is string => text !== null))];
    expect(RLS_ALLOW_LIST).toHaveLength(38);
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

  it("S6.4-e R7, R13 (SEC-B1, V-15) no rls_account check keys on a parent key a T1 login can duplicate or re-key, and every check is anchored or a parent check this sweep reads", async () => {
    const sweep = await classSweep();
    console.info(`SEC-B1 CLASS FRAME tables=${sweep.verdicts.size} anchored=${[...sweep.verdicts.values()].filter(({ kind }) => kind === "ANCHORED").length} `
      + `parent_checks=${[...sweep.verdicts.values()].filter(({ kind }) => kind !== "ANCHORED").length} `
      + `holds=${[...sweep.verdicts.values()].filter(({ kind }) => kind === "HOLDS").length} `
      + `orphan_claims=${[...sweep.verdicts.values()].filter(({ kind }) => kind === "ORPHAN").length} `
      + `bridges=${[...sweep.verdicts.values()].filter(({ kind }) => kind === "NON_UNIQUE" || kind === "REKEY").length}`);
    expect({
      unrecognized: sweep.unrecognized,
      bridges: [...sweep.verdicts].filter(([, { kind }]) => kind === "NON_UNIQUE" || kind === "REKEY" || kind === "UNRECOGNIZED")
        .map(([child, verdict]) => `${child} ${verdict.kind}${verdict.via === undefined ? "" : ` via ${verdict.via}`}`)
    }).toEqual({ unrecognized: [], bridges: [] });
  });

  it("S6.4-f R7 (FIX-S01-p1a NEW-1, the orphan-claim residue) the parent checks a child row without its parent row lets a T1 login meet are exactly these six", async () => {
    const sweep = await classSweep();
    expect([...sweep.verdicts].filter(([, { kind }]) => kind === "ORPHAN")
      .map(([child, verdict]) => `${child}${verdict.via === undefined ? "" : ` via ${verdict.via}`}`).sort())
      .toEqual([...ORPHAN_CLAIM_RESIDUE].sort());
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
