import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// Test-only, as tests/integration/migration-per-step.test.ts:3-15: loadMigrationPlan returns the real plan with its
// forward chain cut while `chain.shape` is set (a database left by the release before 0124). The mocked module
// instance is the one migrate() imports, because migrate comes from the same source module below.
const chain = vi.hoisted(() => ({ shape: undefined as undefined | ((steps: readonly unknown[]) => readonly unknown[]) }));
vi.mock("../../packages/db/src/migration-lineage.js", async (original) => {
  const real = await original<typeof import("../../packages/db/src/migration-lineage.js")>();
  return {
    ...real,
    loadMigrationPlan: async () => {
      const plan = await real.loadMigrationPlan();
      return chain.shape === undefined ? plan : { ...plan, forwardChain: Object.freeze([...chain.shape(plan.forwardChain)]) };
    }
  };
});
// Test-only: while `files.replace` is set, a readFile of a path ending in its key returns its bytes instead (S1.2-T11:
// a 0124 manifest whose amendment list differs from the loader's). Every other read is the real one.
const files = vi.hoisted(() => ({ replace: undefined as undefined | Readonly<{ suffix: string; bytes: Buffer }> }));
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  const replaced = ((path: unknown, ...rest: unknown[]) => {
    const name = path instanceof URL ? path.pathname : String(path);
    if (files.replace !== undefined && name.endsWith(files.replace.suffix)) return Promise.resolve(files.replace.bytes);
    return (real.readFile as (...args: unknown[]) => Promise<unknown>)(path, ...rest);
  }) as unknown as typeof real.readFile;
  return { ...real, readFile: replaced, default: { ...real, readFile: replaced } };
});
import type { PoolClient } from "pg";
import { migrate } from "../../packages/db/src/index.js";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import type { ChainStep } from "../../packages/db/src/migration-forward-chain.js";
import { loadForward0124 } from "../../packages/db/src/migration-forward0124.js";
import { parseN1Header } from "../../packages/db/src/migration-n1.js";
import { RLS_ALL_ACCOUNTS_ROLES, RLS_ALLOW_LIST, RLS_AMENDED, RLS_IN_SCOPE, RLS_SCOPE_RULE_SQL } from "../support/rls-scope.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Mission row-level-security S01, cluster C1 (PLAN S01 §1 C1, step S1.2): migration 0124 turns row security on for the
 * 110 in-scope tables with the two policies of D31/D32, makes the 3 in-scope views apply the invoker's security, adds
 * the `rls` schema and the marker role, records itself in the forward chain with a digest that pins every RLS field
 * (R29), amends the six earlier postconditions that pinned the flag (R28; 0111's by Ruling R-10, DECISIONS F-C1-1) and
 * supersedes 0111's verifier (R34). Cases
 * T1-T16 are PLAN S1.2's; every title starts with its id. CI skips this directory; run it alone (two embedded clusters).
 */
const HEAD = "0124_row_level_security.sql";
const PREVIOUS = "0123_side_by_side_releases.sql";
const MIGRATIONS = new URL("../../migrations/", import.meta.url);
const MANIFEST = "lineage/row-level-security-forward0124.json";
const VERIFIER_111 = "lineage/verify-effective-capabilities-111.sql";
const VERIFIER_124 = "lineage/verify-effective-capabilities-124.sql";
const DRIFT_0124 = `POSTCONDITION_DRIFT ${HEAD}`;
const TABLES = RLS_IN_SCOPE.filter(({ kind }) => kind === "r").map(({ relation }) => relation);
const VIEWS = RLS_IN_SCOPE.filter(({ kind }) => kind === "v").map(({ relation }) => relation);
const FUNCTIONS = ["rls.session_credential_hash()", "rls.context_user_id()", "rls.context_owner_ref()", "rls.owns_run(uuid)", "rls.owns_execution_ref(text)"];
const POLICIES = ["rls_account", "rls_all_accounts"];
/** The six amendments of D38 and F-C1-1, hand-copied (relations sorted), as T11 expects them stored. */
const AMENDMENTS = [
  { step: "0111_billing_netopia.sql", relations: ["billing.card_token", "billing.card_token_revocation", "billing.hosted_payment", "billing.notice_quarantine", "billing.payment_notice", "billing.payment_notice_outcome", "billing.payment_notice_raw", "billing.status_read"] },
  { step: "0117_debate_shape_map.sql", relations: ["core.map_choice", "core.map_item", "core.map_position"] },
  { step: "0119_reclaim_resume.sql", relations: ["core.map_position_repoint"] },
  { step: "0121_engine_verdict.sql", relations: ["ledger.point_investigation", "ledger.verdict_vote"] },
  { step: "0122_engine_map_check.sql", relations: ["core.map_answer_check", "core.map_item_rests_on"] },
  { step: "0123_side_by_side_releases.sql", relations: ["core.run_supersession", "ledger.model_spend_waiver"] }
].map(({ step, relations }) => ({ step, relations, field: "relrowsecurity", value: true, policies: POLICIES }));

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const read = (path: string): Promise<Buffer> => readFile(new URL(path, MIGRATIONS));
/** `schema.name` → `"schema"."name"` (identity.user needs the quotes). */
const ident = (relation: string): string => relation.split(".").map((part) => `"${part}"`).join(".");
type Outcome = Readonly<{ ok: true }> | Readonly<{ ok: false; message: string }>;
const outcome = (run: Promise<unknown>): Promise<Outcome> =>
  run.then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, message: error instanceof Error ? error.message : String(error) }));
const lastApplied = async (db: TestDatabase): Promise<string | undefined> =>
  (await db.pool.query<{ name: string }>("SELECT name FROM public.debateai_schema_migration ORDER BY name DESC LIMIT 1")).rows[0]?.name;
/** Runs `body` on one client inside a transaction that is always rolled back. */
async function rolledBack<T>(db: TestDatabase, body: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    return await body(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}
/** A later step with constant digests (tests/integration/migration-per-step.test.ts's probe) that declares `amends`. */
const probe = (previous: ChainStep, amends: NonNullable<ChainStep["amendsPostconditionsOf"]>): ChainStep => Object.freeze({
  name: "0199_probe_amendment.sql", version: "0199_probe_amendment-v1", manifestSha256: "f".repeat(64), sourceSha256: "e".repeat(64), sql: "SELECT 1",
  previousName: previous.name, previousManifestSha256: previous.manifestSha256, previousVerifierSha256: previous.verifierSha256,
  verifierPath: previous.verifierPath, verifierSha256: previous.verifierSha256, verifierSql: previous.verifierSql,
  postconditionEvidence: async () => "d".repeat(64), n1: previous.n1, amendsPostconditionsOf: amends
});
/** The step 0124 of the real chain (its postconditionEvidence is what migrate() compares). */
const step0124 = async (): Promise<ChainStep> => {
  const step = (await loadMigrationPlan()).forwardChain.find(({ name }) => name === HEAD);
  if (step === undefined) throw new Error(`${HEAD} is not in the forward chain`);
  return step;
};
/** T13's snapshot of the eighteen amended tables: the flags, the table and column ACLs, and the policy names. */
const amendedSnapshot = async (db: TestDatabase) => (await db.pool.query(`
  SELECT relation,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,
   (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
   coalesce((SELECT jsonb_agg(p.polname::text ORDER BY p.polname::text COLLATE "C") FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb) AS policies
  FROM unnest($1::text[]) AS relation JOIN pg_class c ON c.oid=to_regclass(relation) ORDER BY relation COLLATE "C"`,
[RLS_AMENDED.map(({ relation }) => relation)])).rows;

describe("S1.2 migration 0124 on an empty database", () => {
  let db: TestDatabase;
  let first: Outcome;
  beforeAll(async () => {
    db = await startTestDatabase();
    first = await outcome(migrate(db.pool));
  }, 600_000);
  afterAll(async () => { await db?.stop(); });

  it("S1.2-T1 (R30) migrate() reaches 0124 on an empty database, and a second migrate() resolves", async () => {
    expect(first).toEqual({ ok: true });
    expect(await lastApplied(db)).toBe(HEAD);
    expect(await outcome(migrate(db.pool))).toEqual({ ok: true });
  }, 600_000);

  it("S1.2-T3 (R1, R2, R4) the scope rule at head returns exactly the 113 measured members", async () => {
    const rows = (await db.pool.query<{ relation: string; kind: string }>(RLS_SCOPE_RULE_SQL)).rows;
    const seen = rows.map(({ relation, kind }) => `${relation}\t${kind}`).sort();
    expect(seen).toEqual(RLS_IN_SCOPE.map(({ relation, kind }) => `${relation}\t${kind}`).sort());
    expect([TABLES.length, VIEWS.length]).toEqual([110, 3]);
  });

  it("S1.2-T4 (R4, D31, D34) each of the 110 tables has row security on, not forced, and exactly the two policies", async () => {
    const rows = (await db.pool.query<{ relation: string; rls: boolean; force: boolean; policies: Array<Record<string, unknown>> }>(`
      SELECT relation,c.relrowsecurity AS rls,c.relforcerowsecurity AS force,
       coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd::text,'permissive',p.polpermissive,
         'roles',(SELECT jsonb_agg(r.name ORDER BY r.name COLLATE "C") FROM (SELECT CASE WHEN rid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(rid)::text END AS name FROM unnest(p.polroles) AS rid) r),
         'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname::text COLLATE "C") FROM pg_policy p WHERE p.polrelid=c.oid),'[]'::jsonb) AS policies
      FROM unnest($1::text[]) WITH ORDINALITY AS wanted(relation,position) JOIN pg_class c ON c.oid=to_regclass(wanted.relation) AND c.relkind='r'
      ORDER BY wanted.position`, [TABLES])).rows;
    expect(rows.map(({ relation }) => relation)).toEqual(TABLES);
    const allAccounts = [...RLS_ALL_ACCOUNTS_ROLES].sort();
    for (const row of rows) {
      expect(row.rls, row.relation).toBe(true);
      expect(row.force, row.relation).toBe(false);
      expect(row.policies.map(({ name }) => name), row.relation).toEqual(POLICIES);
      const [account, all] = row.policies;
      expect(account, row.relation).toMatchObject({ command: "*", permissive: true, roles: ["debateai_runtime"] });
      expect(account!.using, row.relation).toBe(account!.check);
      expect(RLS_ALLOW_LIST, row.relation).toContain(account!.using);
      expect(all, row.relation).toEqual({ name: "rls_all_accounts", command: "*", permissive: true, roles: allAccounts, using: "true", check: "true" });
    }
  });

  it("S1.2-T5 (R12, D33) the 3 views apply the invoker's security, and only the billing role reads core.run_waiting_v", async () => {
    const views = (await db.pool.query<{ relation: string; options: string[] | null }>(
      `SELECT relation,c.reloptions AS options FROM unnest($1::text[]) AS relation JOIN pg_class c ON c.oid=to_regclass(relation) AND c.relkind='v' ORDER BY relation COLLATE "C"`,
      [VIEWS])).rows;
    expect(views.map(({ relation }) => relation)).toEqual([...VIEWS].sort());
    for (const view of views) expect(view.options ?? [], view.relation).toContain("security_invoker=true");
    const reads = (await db.pool.query<{ role: string; reads: boolean }>(
      `SELECT role,has_table_privilege(role,'core.run_waiting_v','SELECT') AS reads FROM unnest($1::text[]) AS role ORDER BY role COLLATE "C"`,
      [["debateai_billing_runtime", "debateai_authorization_runtime", "debateai_runtime"]])).rows;
    expect(reads).toEqual([
      { role: "debateai_authorization_runtime", reads: false },
      { role: "debateai_billing_runtime", reads: true },
      { role: "debateai_runtime", reads: false }
    ]);
  });

  it("S1.2-T6 (D27, D39) the five rls functions are the migrator's STABLE definers on pg_catalog, executable as D39 says", async () => {
    const migrator = (await db.pool.query<{ name: string }>("SELECT current_user AS name")).rows[0]!.name;
    const functions = (await db.pool.query(`
      SELECT signature,pg_get_userbyid(p.proowner)::text AS owner,p.prosecdef AS definer,p.proconfig AS config,p.provolatile::text AS volatility,
       coalesce((SELECT jsonb_agg(g.name ORDER BY g.name COLLATE "C") FROM (SELECT DISTINCT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee)::text END AS name
         FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.privilege_type='EXECUTE' AND a.grantee<>p.proowner) g),'[]'::jsonb) AS executors
      FROM unnest($1::text[]) WITH ORDINALITY AS wanted(signature,position) JOIN pg_proc p ON p.oid=to_regprocedure(wanted.signature)
      ORDER BY wanted.position`, [FUNCTIONS])).rows;
    const contextExecutors = ["debateai_runtime"];
    expect(functions).toEqual(FUNCTIONS.map((signature) => ({
      signature, owner: migrator, definer: true, config: ["search_path=pg_catalog"], volatility: "s",
      executors: signature === "rls.session_credential_hash()" ? [] : contextExecutors
    })));
    const schema = (await db.pool.query<{ runtime: boolean; public_grants: number }>(`
      SELECT has_schema_privilege('debateai_runtime','rls','USAGE') AS runtime,
       (SELECT count(*)::int FROM pg_namespace n,aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='rls' AND a.grantee=0) AS public_grants`)).rows[0];
    expect(schema).toEqual({ runtime: true, public_grants: 0 });
  });

  it("S1.2-T7 (D29) the marker role cannot log in, inherit, act as superuser or bypass row security, and has no member", async () => {
    const role = (await db.pool.query(`
      SELECT rolcanlogin,rolinherit,rolsuper,rolbypassrls,
       (SELECT coalesce(jsonb_agg(pg_get_userbyid(m.member)::text),'[]'::jsonb) FROM pg_auth_members m WHERE m.roleid=r.oid) AS members
      FROM pg_roles r WHERE rolname='debateai_rls_all_accounts'`)).rows;
    expect(role).toEqual([{ rolcanlogin: false, rolinherit: false, rolsuper: false, rolbypassrls: false, members: [] }]);
  });

  it("S1.2-T8 (R29) disabling row security on core.run makes the next migrate() refuse 0124, and 0124's digest moves with every in-scope table's flag", async () => {
    await db.pool.query("ALTER TABLE core.run DISABLE ROW LEVEL SECURITY");
    try {
      await expect(migrate(db.pool)).rejects.toThrow(DRIFT_0124);
    } finally {
      await db.pool.query("ALTER TABLE core.run ENABLE ROW LEVEL SECURITY");
    }
    expect(await outcome(migrate(db.pool))).toEqual({ ok: true });
    const step = await step0124();
    const unpinned = await rolledBack(db, async (client) => {
      const baseline = await step.postconditionEvidence(client);
      const missed: string[] = [];
      const moved = async (statement: string, label: string): Promise<void> => {
        await client.query("SAVEPOINT mutant");
        await client.query(statement);
        if (await step.postconditionEvidence(client) === baseline) missed.push(label);
        await client.query("ROLLBACK TO SAVEPOINT mutant");
      };
      for (const table of TABLES) await moved(`ALTER TABLE ${ident(table)} DISABLE ROW LEVEL SECURITY`, `${table}:relrowsecurity`);
      await moved("ALTER TABLE core.run FORCE ROW LEVEL SECURITY", "core.run:relforcerowsecurity");
      return missed;
    });
    expect(unpinned).toEqual([]);
  }, 600_000);

  it("S1.2-T9 (R29) dropping policy rls_account on serve.answer makes the next migrate() refuse 0124, and 0124's digest moves with a policy's roles, USING and WITH CHECK", async () => {
    await db.pool.query("DROP POLICY rls_account ON serve.answer");
    try {
      await expect(migrate(db.pool)).rejects.toThrow(DRIFT_0124);
    } finally {
      await db.pool.query("CREATE POLICY rls_account ON serve.answer AS PERMISSIVE FOR ALL TO debateai_runtime USING (rls.owns_run(run_id)) WITH CHECK (rls.owns_run(run_id))");
    }
    expect(await outcome(migrate(db.pool))).toEqual({ ok: true });
    const step = await step0124();
    const unpinned = await rolledBack(db, async (client) => {
      const baseline = await step.postconditionEvidence(client);
      const missed: string[] = [];
      for (const [statement, label] of [
        ["ALTER POLICY rls_account ON serve.answer TO PUBLIC", "roles"],
        ["ALTER POLICY rls_account ON serve.answer USING (true)", "using"],
        ["ALTER POLICY rls_account ON serve.answer WITH CHECK (true)", "check"]
      ] as const) {
        await client.query("SAVEPOINT mutant");
        await client.query(statement);
        if (await step.postconditionEvidence(client) === baseline) missed.push(label);
        await client.query("ROLLBACK TO SAVEPOINT mutant");
      }
      return missed;
    });
    expect(unpinned).toEqual([]);
  }, 600_000);

  it("S1.2-T10 (R29) a permissive USING (true) policy added to identity.session makes the next migrate() refuse 0124", async () => {
    await db.pool.query("CREATE POLICY p_true ON identity.session USING (true)");
    try {
      await expect(migrate(db.pool)).rejects.toThrow(DRIFT_0124);
    } finally {
      await db.pool.query("DROP POLICY p_true ON identity.session");
    }
    expect(await outcome(migrate(db.pool))).toEqual({ ok: true });
  }, 600_000);

  it("S1.2-T11 (R28) 0124 records one amendment per earlier step whose postcondition pinned the flag; a disagreeing manifest, an amendment of a later step, a row of an unapplied step and a shared amendment table are refused", async () => {
    const rows = (await db.pool.query(
      `SELECT source_name,amended_by,amendment FROM public.debateai_schema_migration_step_amendment ORDER BY source_name COLLATE "C"`)).rows;
    expect(rows).toEqual(AMENDMENTS.map((amendment) => ({ source_name: amendment.step, amended_by: HEAD, amendment })));
    const step = await step0124();
    expect(step.amendsPostconditionsOf).toEqual(AMENDMENTS);
    const manifest = JSON.parse((await read(MANIFEST)).toString("utf8")) as { amendsPostconditionsOf: typeof AMENDMENTS };
    expect(manifest.amendsPostconditionsOf).toEqual(AMENDMENTS);
    const anchor = { baseRecipeSha256: (await loadMigrationPlan()).recipeSha256, previousName: PREVIOUS,
      previousManifestSha256: step.previousManifestSha256, previousVerifierSha256: step.previousVerifierSha256 };
    await expect(loadForward0124(anchor)).resolves.toMatchObject({ name: HEAD, amendsPostconditionsOf: AMENDMENTS });
    const doctored = { ...manifest, amendsPostconditionsOf: manifest.amendsPostconditionsOf.slice(1) };
    files.replace = { suffix: MANIFEST, bytes: Buffer.from(`${JSON.stringify(doctored, null, 2)}\n`) };
    try {
      await expect(loadForward0124(anchor)).rejects.toThrow("MIGRATION_FORWARD0124_MANIFEST");
    } finally {
      files.replace = undefined;
    }
    // A later step that declares an amendment of a step not yet applied is refused before anything is recorded.
    const late = { step: "0199_probe_later.sql", relations: ["core.run"], field: "relrowsecurity" as const, value: true as const, policies: [] };
    chain.shape = (steps) => [...steps, probe(steps.at(-1) as ChainStep, [late])];
    try {
      await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_AMENDMENT_ORDER");
    } finally {
      chain.shape = undefined;
    }
    // A recorded amendment made by a step this code has not applied is refused on the next migrate().
    await db.pool.query("INSERT INTO public.debateai_schema_migration_step_amendment(source_name,amended_by,amendment,postcondition_evidence_digest,recorded_at) VALUES('0117_debate_shape_map.sql','0199_probe_later.sql','{}',$1,now())", ["0".repeat(64)]);
    try {
      await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_AMENDMENT_BINDING_DRIFT 0199_probe_later.sql");
    } finally {
      await db.pool.query("DELETE FROM public.debateai_schema_migration_step_amendment WHERE amended_by='0199_probe_later.sql'");
    }
    // The amendment table is the installer's alone, as the receipt and declaration tables are.
    await db.pool.query("GRANT SELECT ON public.debateai_schema_migration_step_amendment TO debateai_runtime");
    try {
      await expect(migrate(db.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_AMENDMENT_ACL");
    } finally {
      await db.pool.query("REVOKE SELECT ON public.debateai_schema_migration_step_amendment FROM debateai_runtime");
    }
    expect(await outcome(migrate(db.pool))).toEqual({ ok: true });
  }, 600_000);

  it("S1.2-T12 (R28) disabling row security on core.map_choice makes the next migrate() refuse 0117 first", async () => {
    await db.pool.query("ALTER TABLE core.map_choice DISABLE ROW LEVEL SECURITY");
    try {
      await expect(migrate(db.pool)).rejects.toThrow("POSTCONDITION_DRIFT 0117_debate_shape_map.sql");
    } finally {
      await db.pool.query("ALTER TABLE core.map_choice ENABLE ROW LEVEL SECURITY");
    }
    expect(await outcome(migrate(db.pool))).toEqual({ ok: true });
  }, 600_000);

  it("S1.2-T15 (R26, V-1) 0124 is a drained step that supersedes 0111's verifier, and records that header", async () => {
    expect(parseN1Header(HEAD, (await read(HEAD)).toString("utf8"))).toEqual({
      expand: false, drained: true, keepsVerifier: false, outsideTransaction: false, concurrentIndex: null
    });
    const manifest = JSON.parse((await read(MANIFEST)).toString("utf8")) as { previous: { verifierSha256: string }; verifier: { path: string; sha256: string } };
    expect(manifest.previous.verifierSha256).toBe(sha(await read(VERIFIER_111)));
    expect(manifest.verifier).toEqual({ path: VERIFIER_124, sha256: sha(await read(VERIFIER_124)) });
    const declared = (await db.pool.query(
      "SELECT n1_expand,keeps_verifier FROM public.debateai_schema_migration_step_n1 WHERE source_name=$1", [HEAD])).rows;
    expect(declared).toEqual([{ n1_expand: false, keeps_verifier: false }]);
  });

  it("S1.2-T16 (R34) the 124 verifier refuses billing.card_token without row security and billing.tool_order with it", async () => {
    const verifier = (await read(VERIFIER_124)).toString("utf8");
    await rolledBack(db, async (client) => {
      await client.query("ALTER TABLE billing.card_token DISABLE ROW LEVEL SECURITY");
      await expect(client.query(verifier)).rejects.toThrow("BILLING_NETOPIA_111_TABLE_PRIVILEGE card_token");
    });
    await rolledBack(db, async (client) => {
      await client.query("ALTER TABLE billing.tool_order ENABLE ROW LEVEL SECURITY");
      await expect(client.query(verifier)).rejects.toThrow("BILLING_NETOPIA_111_TABLE_PRIVILEGE tool_order");
    });
    await expect(db.pool.query(verifier)).resolves.toBeDefined();
  });
});

describe("S1.2 migration 0124 on a database the release before migrated", () => {
  let db: TestDatabase;
  let before: Awaited<ReturnType<typeof amendedSnapshot>>;
  let head: Outcome;
  let after: Awaited<ReturnType<typeof amendedSnapshot>>;
  beforeAll(async () => {
    db = await startTestDatabase();
    chain.shape = (steps) => steps.filter((step) => (step as ChainStep).name <= PREVIOUS);
    try {
      await migrate(db.pool);
    } finally {
      chain.shape = undefined;
    }
    before = await amendedSnapshot(db);
    head = await outcome(migrate(db.pool));
    after = await amendedSnapshot(db);
  }, 600_000);
  afterAll(async () => { await db?.stop(); });

  it("S1.2-T2 (R30) migrate() takes a database at 0123 to 0124", async () => {
    expect(head).toEqual({ ok: true });
    expect(await lastApplied(db)).toBe(HEAD);
  });

  it("S1.2-T13 (R28) on the eighteen amended tables 0124 changes only the flag and adds the two policies", () => {
    expect(before.map(({ relation }) => relation)).toEqual(RLS_AMENDED.map(({ relation }) => relation).sort());
    for (const row of before) expect([row.relation, row.relrowsecurity, row.relforcerowsecurity, row.policies]).toEqual([row.relation, false, false, []]);
    expect(after).toEqual(before.map((row) => ({ ...row, relrowsecurity: true, policies: POLICIES })));
  });
});

describe("S1.2 the 124 verifier's source", () => {
  it("S1.2-T14 (R34) differs from the 111 verifier in exactly lines 217 and 221", async () => {
    const old = (await read(VERIFIER_111)).toString("utf8").split("\n");
    const next = (await read(VERIFIER_124)).toString("utf8").split("\n");
    expect(next.length).toBe(old.length);
    expect(next.flatMap((line, index) => line === old[index] ? [] : [index + 1])).toEqual([217, 221]);
    expect(next[220]).toBe("    IF (SELECT c.relowner IS DISTINCT FROM v_install_owner OR c.relkind<>'r' OR c.relrowsecurity IS DISTINCT FROM (v_name <> 'tool_order') OR c.relforcerowsecurity");
  });
});
