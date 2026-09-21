// TEMPORARY REVIEW FIXTURE — REV-S01-p1-security-data-safety. Deleted before handoff.
// Attacks the two pinned trigger admissions of 0067/0068 under the product roles.
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let pool: Pool;

const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";

type Seed = Readonly<{ runId: string; userId: string; ownerRef: string; pseudonym: string }>;

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

async function errorOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "NO_ERROR";
  } catch (error) {
    const e = error as { code?: string; message?: string };
    return `${e.code ?? "?"}:${e.message ?? ""}`;
  }
}

async function seedRun(input: Readonly<{
  planTier?: "free" | "premium" | null;
  freePublicRule?: boolean;
  privateContentLive?: boolean;
}> = {}): Promise<Seed> {
  const runId = randomUUID();
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const identitySessionId = randomUUID();
  const pseudonym = `Public Thinker ${runId}`;
  const planTier = input.planTier === undefined ? "free" : input.planTier;
  const freePublicRule = input.freePublicRule ?? true;
  const privateContentLive = input.privateContentLive ?? true;
  await pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      password_hash,pseudonym,state,adult_affirmed_at,audit_token,owner_ref
    ) VALUES ($1::uuid,decode(md5(($1::uuid)::text)||md5(($1::uuid)::text||':email'),'hex'),
      '{}'::jsonb,'{}'::jsonb,'test-password-hash',$2,'active',clock_timestamp(),$3,$4)
  `, [userId, pseudonym, auditToken, ownerRef]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query(`
      INSERT INTO identity.session(
        session_id,user_id,token_hash,binding_context,idle_expires_at,
        absolute_expires_at,csrf_token_hash,last_mfa_at
      ) VALUES ($1,$2,repeat('a',64),'{}'::jsonb,clock_timestamp()+interval '1 hour',
        clock_timestamp()+interval '2 hours','sha256:'||repeat('b',64),clock_timestamp())
    `, [identitySessionId, userId]);
    await client.query(`
      INSERT INTO identity.run_execution_binding(
        execution_ref,user_id,identity_session_id,run_id,created_at
      ) VALUES ($1,$2,$1,$3,clock_timestamp())
    `, [identitySessionId, userId, runId]);
    await client.query(`
      INSERT INTO core.run_key_provision_intent(
        run_id,user_id,owner_ref,identity_session_id,execution_ref,
        requested_at,expires_at,cleanup_state
      ) VALUES ($1,$2,$3,$4,$4,clock_timestamp(),clock_timestamp()+interval '5 minutes','PREPARED')
    `, [runId, userId, ownerRef, identitySessionId]);
    await client.query(`
      INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at)
      VALUES ($1::uuid,decode(md5(($1::uuid)::text||':secret')||md5(($1::uuid)::text||':secret:2'),'hex'),clock_timestamp())
    `, [runId]);
    await client.query(`
      INSERT INTO core.run(
        run_id,question_line,ask_contract,asker_id,session_id,caller_scope,as_of,
        asker_risk_tier,risk_tier,tier_source,tier_provenance_ref,
        composition_budget_tier,plan_tier,free_public_rule,depth_params,agent_count,
        discovered_panel,stranger_sample_rate,envelope_basis,register_version,battery_version,
        created_at_seq,content_encryption_version,question_blind_index_version,
        content_ciphertext,content_attestation
      ) VALUES (
        $1::uuid,'⟦DEBATEAI:CIPHERTEXT:V1⟧','{"ciphertext":true,"v":1}'::jsonb,
        'owner:'||$2::text,$3::text,'ASKER',clock_timestamp(),'standard','standard','ASKER',
        'rev-probe','low',$4,$5,'{}'::jsonb,1,'[{}]'::jsonb,0.1,'{}'::jsonb,1,'rev-probe',
        ledger.allocate_sequence(),1,2,
        '{"v":1,"keyId":"k","nonce":"n","ct":"c","tag":"t"}'::jsonb,
        audit_crypto_internal.hmac(
          core.content_envelope_attestation_bytes(
            $1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',
            '{"v":1,"keyId":"k","nonce":"n","ct":"c","tag":"t"}'::jsonb
          ),
          decode(md5(($1::uuid)::text||':secret')||md5(($1::uuid)::text||':secret:2'),'hex'),
          'sha256'
        )
      )
    `, [runId, ownerRef, identitySessionId, planTier, freePublicRule]);
    await client.query(`
      INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq)
      VALUES ($1,$2,ledger.allocate_sequence())
    `, [runId, ownerRef]);
    await client.query("COMMIT");
    await pool.query("DELETE FROM identity.session WHERE session_id=$1", [identitySessionId]);
    if (!privateContentLive) {
      await pool.query(`
        INSERT INTO serve.private_run_key_cleanup_intent(
          request_ref,user_id,run_id,requested_at,cleanup_publication_refs
        ) VALUES ($1,$2,$3,clock_timestamp(),ARRAY[]::uuid[])
      `, [randomUUID(), userId, runId]);
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { runId, userId, ownerRef, pseudonym };
}

function content(seed: Seed, ref: string, at: Date) {
  return {
    public_ref: ref,
    author_pseudonym: seed.pseudonym,
    question: "Does a public square need a gatekeeper?",
    published_at: at.toISOString(),
    answer: {
      terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true,
      confidence_band: "high", summary_segments: [{ text: "A public answer." }],
      badges: [], residual_objections: [], reversal_point: "New evidence",
      as_of: at.toISOString(), nodes: [], edges: [], tree_included: true
    }
  };
}

async function prepareIntent(seed: Seed, ref: string, role = "debateai_runtime"): Promise<boolean> {
  return withRole(role, async (c) => {
    const r = await c.query<{ prepared: boolean }>(
      "SELECT serve.prepare_system_publication_key_provision($1,$2,$3,$4) AS prepared",
      [ref, seed.runId, seed.userId, seed.ownerRef]
    );
    return r.rows[0]?.prepared === true;
  });
}

async function systemPublish(seed: Seed, ref: string, at = new Date()): Promise<string | null> {
  return withRole("debateai_runtime", async (c) => {
    const r = await c.query<{ publication_ref: string | null }>(`
      SELECT core.transition_system_run_publication($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
        AS publication_ref
    `, [
      randomUUID(), seed.runId, seed.userId, seed.ownerRef, ref, seed.pseudonym,
      JSON.stringify(content(seed, ref, at)), at, randomUUID(), randomUUID()
    ]);
    return r.rows[0]?.publication_ref ?? null;
  });
}

async function latestVisibility(runId: string): Promise<string | null> {
  const r = await pool.query<{ state: string }>(
    "SELECT state FROM core.run_visibility_event WHERE run_id=$1 ORDER BY at_seq DESC LIMIT 1",
    [runId]
  );
  return r.rows[0]?.state ?? null;
}

beforeAll(async () => {
  database = await startTestDatabase();
  pool = database.pool as unknown as Pool;
  await migrate(database.pool);
  await pool.query("CREATE ROLE rev_s01_nobody NOLOGIN NOINHERIT");
  await pool.query("GRANT USAGE ON SCHEMA core,serve,identity TO rev_s01_nobody");
}, 300_000);

afterAll(async () => {
  await database?.stop();
});

describe("REV-S01-p1 security: forging the pinned admissions", () => {
  it("A1 debateai_runtime cannot insert an f1 PUBLISHED visibility row directly", async () => {
    const seed = await seedRun();
    const ref = randomUUID();
    expect(await prepareIntent(seed, ref)).toBe(true);
    const outcome = await errorOf(() => withRole("debateai_runtime", (c) => c.query(`
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',clock_timestamp(),
        ledger.allocate_sequence())
    `, [randomUUID(), seed.runId, ref, F1])));
    console.log("A1 runtime direct f1 insert:", outcome);
    expect(outcome.startsWith("42501")).toBe(true);
  });

  it("A2 debateai_erasure_runtime cannot insert an f2 PRIVATE visibility row directly", async () => {
    const seed = await seedRun();
    const ref = randomUUID();
    expect(await prepareIntent(seed, ref)).toBe(true);
    expect(await systemPublish(seed, ref)).toBe(ref);
    await pool.query(`
      INSERT INTO serve.publication_key_cleanup_intent(
        publication_ref,requested_at,completed_at,cleanup_state,
        cleanup_claim_token,cleanup_claim_expires_at,destroy_result
      ) VALUES ($1,clock_timestamp(),NULL,'PENDING',NULL,NULL,NULL)
    `, [ref]);
    const outcome = await errorOf(() => withRole("debateai_erasure_runtime", (c) => c.query(`
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',clock_timestamp(),
        ledger.allocate_sequence())
    `, [randomUUID(), seed.runId, ref, F2])));
    console.log("A2 erasure direct f2 insert:", outcome);
    const runtimeOutcome = await errorOf(() => withRole("debateai_runtime", (c) => c.query(`
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',clock_timestamp(),
        ledger.allocate_sequence())
    `, [randomUUID(), seed.runId, ref, F2])));
    console.log("A2 runtime direct f2 insert:", runtimeOutcome);
    const nobody = await errorOf(() => withRole("rev_s01_nobody", (c) => c.query(
      "INSERT INTO core.run_visibility_event(run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq) VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',clock_timestamp(),1)",
      [randomUUID(), seed.runId, ref, F2]
    )));
    console.log("A2 nobody direct f2 insert:", nobody);
    expect([outcome, runtimeOutcome, nobody].every((o) => o.startsWith("42501"))).toBe(true);
  });

  it("A3 runtime cannot forge a system audit row directly, but may append DENY rows for any run", async () => {
    const seed = await seedRun();
    const direct = await errorOf(() => withRole("debateai_runtime", (c) => c.query(`
      INSERT INTO identity.audit_event(
        audit_id,actor_key_ref,event_type,target_type,target_id,occurred_at,
        source_context,decision,success,justification
      ) VALUES ($1,'system:free-public-auto-publish','debate.publication.published',
        'debate.publication_event_ref',$2,clock_timestamp(),
        '{"schema":"s10-publication-event-v2"}'::jsonb,'ALLOW',true,NULL)
    `, [randomUUID(), randomUUID()])));
    console.log("A3 runtime direct audit insert:", direct);
    // The granted wrapper: can runtime append a DENY row naming a run it has no relation to?
    const foreign = await seedRun({ planTier: "premium" });
    const appended = await withRole("debateai_runtime", async (c) => {
      const r = await c.query<{ appended: boolean }>(
        "SELECT identity.audit_system_publication_attempt($1,$2,$3,$4,$5) AS appended",
        [randomUUID(), foreign.runId, "AUTO_PUBLISH_CIPHER_FAILED", new Date(), "DENY"]
      );
      return r.rows[0]?.appended === true;
    });
    console.log("A3 runtime DENY-audit for an unrelated premium run appended:", appended);
    console.log("A3 seed used:", seed.runId.slice(0, 8));
    expect(direct.startsWith("42501")).toBe(true);
  });

  it("A4 prepare_system_publication_key_provision does NOT check boundness", async () => {
    const premium = await seedRun({ planTier: "premium" });
    const nullTier = await seedRun({ planTier: null });
    const preRule = await seedRun({ planTier: "free", freePublicRule: false });
    const refs = { premium: randomUUID(), nullTier: randomUUID(), preRule: randomUUID() };
    const results = {
      premiumPrepared: await prepareIntent(premium, refs.premium),
      nullTierPrepared: await prepareIntent(nullTier, refs.nullTier),
      preRulePrepared: await prepareIntent(preRule, refs.preRule)
    };
    console.log("A4 prepare() on unbound runs:", JSON.stringify(results));
    const transitions = {
      premium: await systemPublish(premium, refs.premium),
      nullTier: await systemPublish(nullTier, refs.nullTier),
      preRule: await systemPublish(preRule, refs.preRule)
    };
    console.log("A4 transition() on unbound runs:", JSON.stringify(transitions));
    console.log("A4 visibility after:", JSON.stringify({
      premium: await latestVisibility(premium.runId),
      nullTier: await latestVisibility(nullTier.runId),
      preRule: await latestVisibility(preRule.runId)
    }));
    expect(transitions).toEqual({ premium: null, nullTier: null, preRule: null });
  });

  it("A5 the f1 trigger admission itself admits an UNBOUND run and an EXPIRED intent", async () => {
    // Runs as the table owner: this measures what the TRIGGER alone enforces, i.e. the
    // guarantee that survives if any role ever gains INSERT on core.run_visibility_event.
    const premium = await seedRun({ planTier: "premium" });
    const ref = randomUUID();
    expect(await prepareIntent(premium, ref)).toBe(true);
    const unbound = await errorOf(() => pool.query(`
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',clock_timestamp(),
        ledger.allocate_sequence())
    `, [randomUUID(), premium.runId, ref, F1]));
    console.log("A5 owner f1 insert on a PREMIUM run:", unbound,
      "latest =", await latestVisibility(premium.runId));

    const free = await seedRun();
    const ref2 = randomUUID();
    expect(await prepareIntent(free, ref2)).toBe(true);
    await pool.query(
      "UPDATE serve.system_publication_key_provision_intent SET expires_at=clock_timestamp()-interval '1 day' WHERE publication_ref=$1",
      [ref2]
    );
    const expired = await errorOf(() => pool.query(`
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',clock_timestamp(),
        ledger.allocate_sequence())
    `, [randomUUID(), free.runId, ref2, F1]));
    console.log("A5 owner f1 insert with an EXPIRED intent:", expired,
      "latest =", await latestVisibility(free.runId));
    expect(unbound.startsWith("55000")).toBe(true);
    expect(expired.startsWith("55000")).toBe(true);
  });

  it("A6 the f2 trigger admission does not tie the cleanup intent to the row's run", async () => {
    const victim = await seedRun();
    const attacker = await seedRun();
    const victimRef = randomUUID();
    expect(await prepareIntent(victim, victimRef)).toBe(true);
    expect(await systemPublish(victim, victimRef)).toBe(victimRef);
    const attackerRef = randomUUID();
    expect(await prepareIntent(attacker, attackerRef)).toBe(true);
    expect(await systemPublish(attacker, attackerRef)).toBe(attackerRef);
    // One PENDING cleanup intent exists for the victim's publication only.
    await pool.query(`
      INSERT INTO serve.publication_key_cleanup_intent(
        publication_ref,requested_at,completed_at,cleanup_state,
        cleanup_claim_token,cleanup_claim_expires_at,destroy_result
      ) VALUES ($1,clock_timestamp(),NULL,'PENDING',NULL,NULL,NULL)
    `, [victimRef]);
    const crossed = await errorOf(() => pool.query(`
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',clock_timestamp(),
        ledger.allocate_sequence())
    `, [randomUUID(), attacker.runId, victimRef, F2]));
    console.log("A6 owner f2 insert, attacker run + victim publication_ref:", crossed,
      "attacker latest =", await latestVisibility(attacker.runId),
      "victim latest =", await latestVisibility(victim.runId));
    expect(crossed.startsWith("55000")).toBe(true);
    expect(await latestVisibility(attacker.runId)).toBe("PUBLISHED");
  });

  it("A7 a second system publish of one run is refused", async () => {
    const seed = await seedRun();
    const first = randomUUID();
    expect(await prepareIntent(seed, first)).toBe(true);
    expect(await systemPublish(seed, first)).toBe(first);
    const second = randomUUID();
    const prepared = await prepareIntent(seed, second);
    const published = prepared ? await systemPublish(seed, second) : null;
    console.log("A7 second publish: prepared =", prepared, "published =", published);
    const refs = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.publication_snapshot WHERE run_id=$1",
      [seed.runId]
    );
    console.log("A7 snapshots for the run:", refs.rows[0]?.count);
    expect(published).toBeNull();
    expect(refs.rows[0]?.count).toBe("1");
  });

  it("A8 an erased run is not system-published", async () => {
    const seed = await seedRun({ privateContentLive: false });
    const ref = randomUUID();
    const prepared = await prepareIntent(seed, ref);
    const published = prepared ? await systemPublish(seed, ref) : null;
    console.log("A8 erased run: prepared =", prepared, "published =", published,
      "latest =", await latestVisibility(seed.runId));
    expect(published).toBeNull();
  });

  it("A9 R-20.4: a system publish leaves no grant and no session reference", async () => {
    const seed = await seedRun();
    const ref = randomUUID();
    expect(await prepareIntent(seed, ref)).toBe(true);
    expect(await systemPublish(seed, ref)).toBe(ref);
    const grants = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity.step_up_grant WHERE action='PUBLISH' AND target_run_id=$1",
      [seed.runId]
    );
    const audit = await pool.query(
      `SELECT audit_id,actor_key_ref,event_type,target_type,target_id,decision,success,
              justification,source_context
         FROM identity.audit_event WHERE target_id=$1 ORDER BY occurred_at`,
      [ref]
    );
    const auditColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='identity' AND table_name='audit_event' ORDER BY ordinal_position`
    );
    const sessions = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity.session WHERE user_id=$1",
      [seed.userId]
    );
    console.log("A9 grants:", grants.rows[0]?.count, "sessions:", sessions.rows[0]?.count);
    console.log("A9 audit rows:", JSON.stringify(audit.rows, null, 1));
    console.log("A9 audit_event columns:",
      JSON.stringify(auditColumns.rows.map((r) => r.column_name)));
    const bindings = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM identity.publication_event_binding WHERE run_id=$1",
      [seed.runId]
    );
    console.log("A9 publication_event_binding rows:", bindings.rows[0]?.count);
    expect(grants.rows[0]?.count).toBe("0");
  });

  it("A10 warning_version parity with an owner-driven publish", async () => {
    const rows = await pool.query<{ warning_version: string; count: string }>(
      `SELECT warning_version,count(*)::text AS count FROM core.run_visibility_event
        WHERE state='PUBLISHED' GROUP BY warning_version`
    );
    console.log("A10 PUBLISHED warning_version values:", JSON.stringify(rows.rows));
    const ownerDefault = await pool.query<{ def: string | null }>(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc
        WHERE proname='transition_run_publication' LIMIT 1`
    );
    const def = ownerDefault.rows[0]?.def ?? "";
    console.log("A10 owner transition mentions PUBLIC_INDEXED_V1:",
      def.includes("PUBLIC_INDEXED_V1"));
    expect(def.length).toBeGreaterThan(0);
  });
});
