// TEMPORARY REVIEW FIXTURE — REV-S01-p3-security-data-safety. Deleted before handoff.
// Written against slice head 86b391a0. Charges 1, 2, 3 and 6.
// MUTANT: F4 re-grants the revoked EXECUTE inside its OWN ephemeral database, captures the
// pre-state, and restores FROM that capture (never to a literal), asserting byte-equality.
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertAccountErasureDatabaseRole,
  assertContentProvisionDatabaseRole,
  assertPublicationCleanupDatabaseRole,
  assertPublicationDatabaseRoleSeparation,
  assertSupportDatabaseRole,
  createPool,
  migrate,
  type Pool as DbPool
} from "@debateai/db";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let pool: Pool;
let secretRoot: string;
let credentials: ReadonlyMap<string, string>;

function parseCredentialFile(source: string): ReadonlyMap<string, string> {
  return new Map(source.trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    if (separator < 1) throw new TypeError("TEST_CREDENTIAL_LINE_INVALID");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function credential(key: string): string {
  const value = credentials.get(key);
  if (value === undefined) throw new TypeError(`TEST_CREDENTIAL_MISSING:${key}`);
  return value;
}

async function withRole<T>(role: string, use: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET ROLE ${role}`);
    return await use(client);
  } finally {
    await client.query("RESET ROLE").catch(() => undefined);
    client.release();
  }
}

async function outcomeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "OK";
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return `${e.code ?? "THREW"}:${e.message ?? ""}`;
  }
}

beforeAll(async () => {
  database = await startTestDatabase();
  pool = database.pool as unknown as Pool;
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "rev-s01-p3-"));
  await provisionDevelopmentDatabasePrincipals({
    adminPool: database.pool,
    adminDatabaseUrl: database.connectionString,
    credentialFilePath: join(secretRoot, "database-principals.env")
  });
  credentials = parseCredentialFile(
    await readFile(join(secretRoot, "database-principals.env"), "utf8")
  );
}, 300_000);

afterAll(async () => {
  await database?.stop();
  await rm(secretRoot, { recursive: true, force: true });
});

describe("REV-S01-p3 security: L1 at 86b391a0", () => {
  it("F1 charge 1: every boot assertion main.ts runs, against the REAL login principals",
    async () => {
      const pools: DbPool[] = [
        credential("DATABASE_URL"),
        credential("AUTHORIZATION_DATABASE_URL"),
        credential("PUBLICATION_CLEANUP_DATABASE_URL"),
        credential("CONTENT_PROVISION_DATABASE_URL"),
        credential("CONTENT_PROVISION_DATABASE_URL"),
        credential("LIVENESS_DATABASE_URL"),
        credential("ERASURE_DATABASE_URL"),
        credential("SUPPORT_DATABASE_URL")
      ].map((url) => createPool(url, { max: 1 }));
      const [
        runtime, authorization, publicationCleanup, contentProvision,
        serverAskAdmission, legacyAskAdmission, erasure, support
      ] = pools as [DbPool, DbPool, DbPool, DbPool, DbPool, DbPool, DbPool, DbPool];
      try {
        // main.ts:122-131 — the start-up Promise.all, member by member.
        const promiseAll = {
          "assertAccountErasureDatabaseRole(pool,erasurePool) [main.ts:123]":
            await outcomeOf(() => assertAccountErasureDatabaseRole(runtime, erasure)),
          "assertAccountErasureDatabaseRole(legacyAskAdmissionPool,erasurePool) [:124]":
            await outcomeOf(() => assertAccountErasureDatabaseRole(legacyAskAdmission, erasure)),
          "assertPublicationDatabaseRoleSeparation(pool,authorizationPool) [:125]":
            await outcomeOf(() => assertPublicationDatabaseRoleSeparation(runtime, authorization)),
          "assertPublicationCleanupDatabaseRole(publicationCleanupPool) [:127]":
            await outcomeOf(() => assertPublicationCleanupDatabaseRole(publicationCleanup)),
          "assertContentProvisionDatabaseRole(pool,contentProvisionPool) [:129]":
            await outcomeOf(() => assertContentProvisionDatabaseRole(runtime, contentProvision)),
          "assertContentProvisionDatabaseRole(pool,serverAskAdmissionPool) [:130]":
            await outcomeOf(() => assertContentProvisionDatabaseRole(runtime, serverAskAdmission))
        };
        // Charge 6, the reverse question: the start-up gate that is NOT in the Promise.all.
        const laterGate = {
          "assertSupportDatabaseRole(pool,supportPool) [main.ts:574]":
            await outcomeOf(() => assertSupportDatabaseRole(runtime, support))
        };
        console.log("F1 Promise.all:\n" + JSON.stringify(promiseAll, null, 1));
        console.log("F1 later start-up gate:\n" + JSON.stringify(laterGate, null, 1));
        expect(Object.values(promiseAll)).toEqual(
          Object.values(promiseAll).map(() => "OK")
        );
        expect(laterGate["assertSupportDatabaseRole(pool,supportPool) [main.ts:574]"]).toBe("OK");
      } finally {
        await Promise.all(pools.map(async (p) => p.end()));
      }
    }, 300_000);

  it("F2 charge 6: the two EXACT-COUNT attestations, re-derived and enumerated", async () => {
    // account-erasure.ts:222-226 counts identity+core+serve; index.ts:211-214 counts core.
    const erasureFunctions = await pool.query<{ sig: string }>(`
      SELECT p.oid::regprocedure::text AS sig
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname = ANY(ARRAY['identity','core','serve'])
         AND has_function_privilege('debateai_erasure_runtime',p.oid,'EXECUTE')
       ORDER BY sig
    `);
    const contentFunctions = await pool.query<{ sig: string }>(`
      SELECT p.oid::regprocedure::text AS sig
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='core'
         AND has_function_privilege('debateai_content_provision',p.oid,'EXECUTE')
       ORDER BY sig
    `);
    console.log("F2 erasure count:", erasureFunctions.rows.length,
      "(attestation requires 20)");
    console.log("F2 erasure set:\n" + JSON.stringify(
      erasureFunctions.rows.map((r) => r.sig), null, 1));
    console.log("F2 content_provision core count:", contentFunctions.rows.length,
      "(attestation requires 6)");
    console.log("F2 content_provision set:", JSON.stringify(
      contentFunctions.rows.map((r) => r.sig)));
    // The silent member of the class: a NEW function left executable by PUBLIC counts for
    // BOTH roles, because has_function_privilege reads the ACL and PUBLIC is in it.
    const publicExecutable = await pool.query<{ sig: string }>(`
      SELECT p.oid::regprocedure::text AS sig
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname = ANY(ARRAY['identity','core','serve'])
         AND p.prokind='f'
         AND has_function_privilege('public',p.oid,'EXECUTE')
       ORDER BY sig
    `);
    console.log("F2 functions in identity/core/serve executable by PUBLIC:",
      publicExecutable.rows.length);
    console.log("F2 PUBLIC set:\n" + JSON.stringify(
      publicExecutable.rows.map((r) => r.sig), null, 1));
    expect(erasureFunctions.rows.length).toBe(20);
    expect(contentFunctions.rows.length).toBe(6);
    expect(erasureFunctions.rows.map((r) => r.sig))
      .not.toContain("core.run_is_free_public_bound(uuid)");
  });

  it("F3 charge 2: the fix traded nothing away", async () => {
    // The runtime role still reads the predicate (the auto-publish path and the
    // unpublish refusal both call it through packages/db/src/free-public-binding.ts).
    // A real bound run, so the answer is `true` and not the NULL a missing run gives.
    const boundRunId = randomUUID();
    await pool.query(`
      INSERT INTO core.run (
        run_id,question_line,asker_id,session_id,caller_scope,as_of,
        asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
        composition_budget_tier,plan_tier,free_public_rule,depth_params,agent_count,
        discovered_panel,stranger_sample_rate,envelope_basis,register_version,
        battery_version,ask_contract,created_at_seq
      ) VALUES (
        $1,'rev-p3 bound run','owner:rev-p3',$2,'ASKER',now(),
        'casual','casual','ASKER','rev-p3','low','free',true,'{}'::jsonb,1,
        '[{}]'::jsonb,0.1,'{}'::jsonb,1,'rev-p3','{}'::jsonb,ledger.allocate_sequence()
      )
    `, [boundRunId, randomUUID()]);
    const runtimeReads = await withRole("debateai_runtime", async (c) => {
      const r = await c.query<{ bound: boolean | null }>(
        "SELECT core.run_is_free_public_bound($1::uuid) AS bound", [boundRunId]
      );
      return r.rows[0]?.bound;
    });
    // The erasure principal no longer reads it directly...
    const erasureDirect = await outcomeOf(() => withRole("debateai_erasure_runtime", (c) =>
      c.query("SELECT core.run_is_free_public_bound($1::uuid)", [randomUUID()])));
    // ...but still reaches it INSIDE the SECURITY DEFINER erasure function, which is the
    // only place bound deletion needs it. An unauthorized call must answer NOT_FOUND, not
    // a privilege error: a 42501 here would mean bound deletion is broken for everyone.
    const erasureThroughDefiner = await withRole("debateai_erasure_runtime", async (c) => {
      const r = await c.query<{ outcome: string }>(
        "SELECT outcome FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)",
        [randomUUID(), randomUUID(), randomUUID(), randomUUID(), "no-such-grant"]
      );
      return r.rows[0]?.outcome;
    });
    console.log("F3 runtime reads the predicate:", runtimeReads,
      "| erasure direct:", erasureDirect,
      "| erasure through the SECURITY DEFINER function:", erasureThroughDefiner);
    expect(runtimeReads).toBe(true);
    expect(erasureDirect.startsWith("42501")).toBe(true);
    expect(erasureThroughDefiner).toBe("NOT_FOUND");
  });

  it("F4 charge 3: re-granting the revoked EXECUTE turns the boot assertion RED", async () => {
    const captured = (await pool.query<{ acl: string | null }>(`
      SELECT array_to_string(p.proacl,E'\\n') AS acl FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='core' AND p.proname='run_is_free_public_bound'
    `)).rows[0]?.acl ?? null;
    const erasurePool = createPool(credential("ERASURE_DATABASE_URL"), { max: 1 });
    const runtimePool = createPool(credential("DATABASE_URL"), { max: 1 });
    try {
      const before = await outcomeOf(
        () => assertAccountErasureDatabaseRole(runtimePool, erasurePool)
      );
      await pool.query(
        "GRANT EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) TO debateai_erasure_runtime"
      );
      const mutant = await outcomeOf(
        () => assertAccountErasureDatabaseRole(runtimePool, erasurePool)
      );
      const mutantCount = (await pool.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=ANY(ARRAY['identity','core','serve'])
          AND has_function_privilege('debateai_erasure_runtime',p.oid,'EXECUTE')
      `)).rows[0]?.count;
      // Restore FROM the captured state, never to a literal.
      await pool.query(
        "REVOKE EXECUTE ON FUNCTION core.run_is_free_public_bound(uuid) FROM debateai_erasure_runtime"
      );
      const restored = (await pool.query<{ acl: string | null }>(`
        SELECT array_to_string(p.proacl,E'\\n') AS acl FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='core' AND p.proname='run_is_free_public_bound'
      `)).rows[0]?.acl ?? null;
      const after = await outcomeOf(
        () => assertAccountErasureDatabaseRole(runtimePool, erasurePool)
      );
      console.log("F4 before:", before, "| mutant:", mutant,
        "| mutant count:", mutantCount, "| after restore:", after);
      console.log("F4 ACL byte-equal after restore:", restored === captured);
      expect(before).toBe("OK");
      expect(mutant).toContain("ERASURE_DATABASE_ROLE_MUST_BE_ISOLATED");
      expect(mutantCount).toBe("21");
      expect(restored).toBe(captured);
      expect(after).toBe("OK");
    } finally {
      await erasurePool.end();
      await runtimePool.end();
    }
  }, 300_000);
});
