import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, EntitlementRepository, PostgresInternalAllowanceRepository, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { canonicalInternalAllowanceActionBinding } from "../../apps/api/src/staff/routes.js";

/**
 * Funding grants stay valid under the version they were issued with (side-by-side uploads spec 2026-10-21 §9, C15;
 * migration 0123 §6). A release runs its debates on its own register version, so the run's version, the funding
 * selection's version and the grant's version may all differ while a later release takes the traffic: nothing compares
 * a grant with the selection or with the run any more. New grants still take the selection's version (configure is
 * unchanged), a revoke still names the grant's own version, and switching funding off (no selection) still stops every
 * funded run. CI skips this directory; run it alone.
 */
let database: TestDatabase, runtime: Pool, fixture: ReturnType<typeof internalFundingFixture>;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE funding_decoupled LOGIN PASSWORD 'private-fixture-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  const url = new URL(database.connectionString);
  url.username = "funding_decoupled";
  url.password = "private-fixture-only";
  runtime = createPool(url.toString());
  fixture = internalFundingFixture(database.pool, runtime);
}, 120000);
// Every case starts from the v2 selection (fundedActor selects it) and leaves it there.
afterEach(async () => { await fixture.selectFunding(); });
afterAll(async () => { await runtime?.end(); await database?.stop(); });

/** A v2 grant for a new funded person, issued while the selection names v2. */
async function v2Grant() {
  const actor = await fixture.fundedActor(), command = fixture.configureCommand(actor);
  await fixture.configure(actor, command);
  const grant = (await new PostgresInternalAllowanceRepository(runtime).current(actor.ownerRef, new Date()))!;
  expect(grant.policyRegisterVersion).toBe(2);
  return { actor, command, grant };
}
/** A run on `registerVersion`, funded by `grant` (its charge scope pinned as the room pins it). */
async function fundedRun(ownerRef: string, grant: Readonly<{ grantId: string; grantEventId: string }>, registerVersion: number) {
  const runId = await fixture.run(ownerRef, "premium", registerVersion), tx = await runtime.connect();
  try {
    await new EntitlementRepository(runtime).recordRunChargeScope(tx, { runId, ownerRef,
      basis: { kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId }, admittedAt: new Date() });
  } finally { tx.release(); }
  return runId;
}
const reserve = (call: string, runId: string) =>
  runtime.query<{ internal: boolean }>("SELECT billing.reserve_internal_provider_call($1::uuid,$2::uuid,10::bigint,'RUN','BODY') AS internal", [call, runId]);
const readAllowance = (ownerRef: string) =>
  runtime.query<{ value: Record<string, unknown> | null }>("SELECT billing.read_internal_allowance($1::uuid,clock_timestamp()) AS value", [ownerRef]);

describe("side-by-side §9: a funding grant stays valid under the version it was issued with", () => {
  it("a v2 grant admits provider calls after the selection moves to v3", async () => {
    const { actor, grant } = await v2Grant();
    await fixture.selectNextFunding();
    const runId = await fundedRun(actor.ownerRef, grant, 3);
    expect((await reserve(randomUUID(), runId)).rows[0]!.internal).toBe(true);
  });

  it("run state stays ACTIVE across the move", async () => {
    const { actor, grant } = await v2Grant();
    const runId = await fundedRun(actor.ownerRef, grant, 2);
    await fixture.selectNextFunding();
    expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(runId)).toBe("ACTIVE");
    // A run of the next release, on v3, funded by the same v2 grant.
    const next = await fundedRun(actor.ownerRef, grant, 3);
    expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(next)).toBe("ACTIVE");
  });

  it("read_internal_allowance returns the v2 grant after the move", async () => {
    const { actor, grant } = await v2Grant();
    await fixture.selectNextFunding();
    expect((await readAllowance(actor.ownerRef)).rows[0]!.value).toMatchObject({ grantId: grant.grantId, policyRegisterVersion: 2 });
    const repository = new PostgresInternalAllowanceRepository(runtime);
    expect(await repository.current(actor.ownerRef, new Date())).toMatchObject({ grantId: grant.grantId, policyRegisterVersion: 2 });
  });

  it("new grants take the pointer's version", async () => {
    const actor = await fixture.fundedActor();
    await fixture.selectNextFunding();
    await expect(fixture.configure(actor, fixture.configureCommand(actor))).rejects.toThrow("INTERNAL_ALLOWANCE_POLICY_MISMATCH");
    const command = fixture.configureCommand(actor, { policyRegisterVersion: 3 });
    expect((await fixture.configure(actor, command)).rows[0].receipt).toMatchObject({ operationId: command.operationId, outcome: "COMPLETED" });
    expect(await new PostgresInternalAllowanceRepository(runtime).current(actor.ownerRef, new Date()))
      .toMatchObject({ grantId: command.operationId, policyRegisterVersion: 3 });
  });

  it("revoke works on a v2 grant after the move", async () => {
    const { actor, grant } = await v2Grant();
    await fixture.selectNextFunding();
    // The command names the grant's own version, never the selection's.
    await expect(fixture.revoke(actor, grant.grantId, 1, 3)).rejects.toThrow("INTERNAL_ALLOWANCE_POLICY_MISMATCH");
    expect((await fixture.revoke(actor, grant.grantId, 1, 2)).rows[0].receipt).toMatchObject({ outcome: "COMPLETED" });
    expect((await database.pool.query("SELECT revoked_at IS NOT NULL AS revoked FROM billing.internal_grant WHERE grant_id=$1", [grant.grantId])).rows)
      .toEqual([{ revoked: true }]);
  });

  it("the staff app's revoke of a v2 grant after the move names v2 and completes through the repository", async () => {
    const { actor, grant } = await v2Grant();
    await fixture.selectNextFunding();
    const repository = new PostgresInternalAllowanceRepository(runtime), token = fixture.ordinaryTokenHash(actor);
    // A configure names the selection's version; a revoke names its grant's own (0123 §6, A4 review).
    expect(await repository.readSelfCommand(actor.context, token, null)).toMatchObject({ policyRegisterVersion: 3 });
    const state = await repository.readSelfCommand(actor.context, token, grant.grantId);
    expect(state).toEqual({ ownerRef: actor.ownerRef, expectedRevision: 1, policyRegisterVersion: 2 });
    // The route's own binding (apps/api/src/staff/routes.ts) and command, built from that state.
    const intent = { action: "ALLOWANCE_REVOKE" as const, grant_id: grant.grantId, operation_id: randomUUID(), reason: { code: "FUNDING_APPROVAL" as const } };
    const binding = canonicalInternalAllowanceActionBinding(intent, state);
    const proof = await fixture.storeProof(actor, binding);
    const receipt = await repository.revoke({ ...state, grantId: grant.grantId, actor: actor.context, operationId: intent.operation_id,
      reason: { code: "FUNDING_APPROVAL" }, proof: { proofId: proof.proofId, binding } as never, alertIntent: proof.alert as never });
    expect(receipt).toMatchObject({ operationId: intent.operation_id, outcome: "COMPLETED" });
    expect((await database.pool.query("SELECT revoked_at IS NOT NULL AS revoked FROM billing.internal_grant WHERE grant_id=$1", [grant.grantId])).rows)
      .toEqual([{ revoked: true }]);
  });

  it("funding switched off still stops funded runs", async () => {
    const { actor, grant } = await v2Grant();
    const runId = await fundedRun(actor.ownerRef, grant, 2);
    await database.pool.query("DELETE FROM staff.funding_policy_selection");
    await expect(readAllowance(actor.ownerRef)).rejects.toThrow("INTERNAL_FUNDING_UNAVAILABLE");
    expect(await new PostgresInternalAllowanceRepository(runtime).readRunState(runId)).toBe("UNAVAILABLE");
    await expect(reserve(randomUUID(), runId)).rejects.toThrow("INTERNAL_FUNDING_UNAVAILABLE");
  });

  it("readPolicy never refuses a version difference", async () => {
    await fixture.fundedActor();
    await fixture.selectNextFunding();
    const repository = new PostgresInternalAllowanceRepository(runtime);
    expect((await repository.readPolicy())?.registerVersion).toBe(3);
    await fixture.selectFunding();
    expect((await repository.readPolicy())?.registerVersion).toBe(2);
  });

  it("readPolicyAt reads the sealed funding publication of a version, whatever the selection names", async () => {
    await fixture.fundedActor();
    await fixture.selectNextFunding();
    const repository = new PostgresInternalAllowanceRepository(runtime);
    const atTwo = await repository.readPolicyAt(2);
    expect(atTwo).toMatchObject({ registerVersion: 2, policy: { enabled: true, maximumDayMicros: 100000, sourceRef: "test:synthetic-funding" } });
    expect(Object.isFrozen(atTwo)).toBe(true);
    expect((await repository.readPolicyAt(3))?.registerVersion).toBe(3);
    // No publication, or one without enabled funding (the bootstrap register): null, never the selection's.
    expect(await repository.readPolicyAt(1)).toBeNull();
    expect(await repository.readPolicyAt(4096)).toBeNull();
    // Funding switched off: a version is still readable (a running debate's grant is checked against it at the
    // database, which refuses it there), so the reader does not depend on the selection at all.
    await database.pool.query("DELETE FROM staff.funding_policy_selection");
    expect((await repository.readPolicyAt(2))?.registerVersion).toBe(2);
    await expect(repository.readPolicyAt(0)).rejects.toMatchObject({ code: "INTERNAL_ALLOWANCE_UNAVAILABLE" });
  });

  it("readPolicyAt refuses an unsealed version (the sealed check, not only the shape)", async () => {
    await fixture.fundedActor();
    // core's CHECK (sealed) and the publication guard make an unsealed version impossible to write, so this case drops
    // the CHECK and the triggers inside one transaction, writes v2's rows as an unsealed v4096, reads, and rolls back.
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      const check = (await client.query<{ name: string }>(`SELECT conname AS name FROM pg_constraint
        WHERE conrelid='register.register_version'::regclass AND contype='c' AND strpos(pg_get_constraintdef(oid),'sealed')>0`)).rows[0]!.name;
      await client.query(`ALTER TABLE register.register_version DROP CONSTRAINT ${JSON.stringify(check)}`);
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query("INSERT INTO register.register_version(register_version,row_count,sealed) SELECT 4096,row_count,false FROM register.register_version WHERE register_version=2");
      await client.query("INSERT INTO register.register_row(register_version,row_key,value_json,source_ref) SELECT 4096,row_key,value_json,source_ref FROM register.register_row WHERE register_version=2");
      const read = async () => (await client.query("SELECT staff.read_internal_funding_policy_at(4096) AS value")).rows[0].value;
      expect(await read()).toBeNull();
      // The same rows, sealed: the publication reads, so the null above was the seal's.
      await client.query("UPDATE register.register_version SET sealed=true WHERE register_version=4096");
      expect(await read()).toMatchObject({ registerVersion: 4096, sourceRef: "test:synthetic-funding" });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect(await new PostgresInternalAllowanceRepository(runtime).readPolicyAt(4096)).toBeNull();
  });
});
