// TEMPORARY REVIEW FIXTURE — REV-S01-p2-security-data-safety. Deleted before handoff.
// Re-derived from the pass-1 probes against slice head c358d494.
// Pass 1 recorded A5/A6 as CHARACTERISATIONS (the trigger admitted them). At this head
// the same inputs must be REFUSED, so those cases are inverted and now assert 55000.
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadKek, MemoryPublicationKeyStore, PublicationCipher } from "@debateai/crypto";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const probeCipher = new PublicationCipher(
  new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xd2)))
);

async function realEnvelope(ref: string, runId: string): Promise<unknown> {
  const prepared = await probeCipher.create(ref, runId);
  try {
    return prepared.encrypt({
      public_ref: ref, author_pseudonym: "Probe",
      question: "probe", published_at: "2026-09-21T00:00:00.000Z",
      answer: {
        terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true,
        confidence_band: "high", summary_segments: [{ text: "probe" }],
        badges: [], residual_objections: [], reversal_point: "new evidence",
        as_of: "2026-09-21T00:00:00.000Z", nodes: [], edges: [], tree_included: true
      }
    });
  } finally {
    prepared.close();
  }
}

let database: TestDatabase;
let pool: Pool;

const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";

// Every function 0069 and 0070 create or replace, plus the pass-1 set they sit on.
const FUNCTIONS = [
  "core.enforce_publication_v2_ref_binding",
  "core.prepare_private_run_erasure",
  "serve.prepare_system_publication_key_provision",
  "core.ensure_free_public_auto_publish_work",
  "core.upsert_free_public_auto_publish_work",
  "identity.audit_system_publication_attempt",
  "core.transition_system_run_publication",
  "core.run_is_free_public_bound",
  "core.clear_free_public_auto_publish_work",
  "core.claim_free_public_auto_publish_work",
  "core.finalize_private_run_erasure",
  "core.resume_private_run_erasure"
] as const;

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
  const sessionId = randomUUID();
  const pseudonym = `Public Thinker ${runId.slice(0, 8)}`;
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
      ) VALUES ($1::uuid,$2,md5(($1::uuid)::text)||md5(($1::uuid)::text||':t'),'{}'::jsonb,
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
        'sha256:'||md5(($1::uuid)::text)||md5(($1::uuid)::text||':c'),clock_timestamp())
    `, [sessionId, userId]);
    await client.query(`
      INSERT INTO identity.run_execution_binding(
        execution_ref,user_id,identity_session_id,run_id,created_at
      ) VALUES ($1,$2,$1,$3,clock_timestamp())
    `, [sessionId, userId, runId]);
    await client.query(`
      INSERT INTO core.run_key_provision_intent(
        run_id,user_id,owner_ref,identity_session_id,execution_ref,
        requested_at,expires_at,cleanup_state
      ) VALUES ($1,$2,$3,$4,$4,clock_timestamp(),clock_timestamp()+interval '5 minutes','PREPARED')
    `, [runId, userId, ownerRef, sessionId]);
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
        'rev-p2','low',$4,$5,'{}'::jsonb,1,'[{}]'::jsonb,0.1,'{}'::jsonb,1,'rev-p2',
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
    `, [runId, ownerRef, sessionId, planTier, freePublicRule]);
    await client.query(`
      INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq)
      VALUES ($1,$2,ledger.allocate_sequence())
    `, [runId, ownerRef]);
    await client.query("COMMIT");
    await pool.query("DELETE FROM identity.session WHERE session_id=$1", [sessionId]);
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
    public_ref: ref, author_pseudonym: seed.pseudonym,
    question: "Does a public square need a gatekeeper?", published_at: at.toISOString(),
    answer: {
      terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true,
      confidence_band: "high", summary_segments: [{ text: "A public answer." }],
      badges: [], residual_objections: [], reversal_point: "New evidence",
      as_of: at.toISOString(), nodes: [], edges: [], tree_included: true
    }
  };
}

async function prepareIntent(seed: Seed, ref: string): Promise<boolean> {
  return withRole("debateai_runtime", async (c) => {
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

// A test-only SECURITY DEFINER inserter. Pass 1 measured that NO product role holds INSERT
// on core.run_visibility_event, so a bare insert under SET ROLE only ever measures the
// privilege layer. This isolates the TRIGGER's decision: it runs as the owner, executes as
// the product role, and reports the trigger's own SQLSTATE.
async function installInserter(): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION public.rev_p2_insert_visibility(
      p_event_id uuid,p_run_id uuid,p_publication_ref uuid,p_state text,
      p_token uuid,p_warning text
    ) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
    SET search_path = pg_catalog AS $fn$
    BEGIN
      INSERT INTO core.run_visibility_event(
        run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
        actor_ref_version,warning_version,occurred_at,at_seq
      ) VALUES (
        p_event_id,p_run_id,p_publication_ref,p_state,p_token,2,p_warning,
        clock_timestamp(),ledger.allocate_sequence()
      );
      RETURN true;
    END;
    $fn$;
  `);
  await pool.query(
    "GRANT EXECUTE ON FUNCTION public.rev_p2_insert_visibility(uuid,uuid,uuid,text,uuid,text) TO debateai_runtime,debateai_erasure_runtime"
  );
}

async function insertVisibility(
  role: string, runId: string, ref: string, state: "PRIVATE" | "PUBLISHED",
  token: string, warning: string
): Promise<string> {
  return errorOf(() => withRole(role, (c) => c.query(
    "SELECT public.rev_p2_insert_visibility($1,$2,$3,$4,$5,$6)",
    [randomUUID(), runId, ref, state, token, warning]
  )));
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
  await pool.query("CREATE ROLE rev_s01_p2_nobody NOLOGIN NOINHERIT");
  await pool.query("GRANT USAGE ON SCHEMA core,serve,identity TO rev_s01_p2_nobody");
  await installInserter();
}, 300_000);

afterAll(async () => {
  await database?.stop();
});

describe("REV-S01-p2 security: the pass-1 findings, re-measured at c358d494", () => {
  it("D1 EXECUTE and search_path over every function 0069/0070 create or replace", async () => {
    const roles = (await pool.query<{ rolname: string }>(
      "SELECT rolname FROM pg_roles WHERE rolname LIKE 'debateai%' ORDER BY rolname"
    )).rows.map((r) => r.rolname).concat(["public", "rev_s01_p2_nobody"]);
    const rows = await pool.query<{
      sig: string; prosecdef: boolean; proconfig: string[] | null; proname: string;
    }>(
      `SELECT p.oid::regprocedure::text AS sig,p.proname,p.prosecdef,p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname||'.'||p.proname = ANY($1::text[]) ORDER BY sig`,
      [[...FUNCTIONS]]
    );
    const grid: Record<string, Record<string, boolean>> = {};
    for (const row of rows.rows) {
      grid[row.sig] = {};
      for (const role of roles) {
        const r = await pool.query<{ allowed: boolean }>(
          "SELECT has_function_privilege($1,$2,'execute') AS allowed", [role, row.sig]
        );
        if (r.rows[0]?.allowed === true) grid[row.sig][role] = true;
      }
    }
    console.log("D1 EXECUTE (only roles that HAVE it):\n" + JSON.stringify(grid, null, 1));
    const unpinned = rows.rows.filter(
      (r) => r.prosecdef && (r.proconfig ?? []).every((c) => !c.startsWith("search_path="))
    ).map((r) => r.sig);
    const notSecdef = rows.rows.filter((r) => !r.prosecdef).map((r) => r.sig);
    console.log("D1 functions found:", rows.rows.length, "of", FUNCTIONS.length);
    console.log("D1 SECDEF without pinned search_path:", JSON.stringify(unpinned));
    console.log("D1 not SECURITY DEFINER:", JSON.stringify(notSecdef));
    const publicHolders = Object.entries(grid)
      .filter(([, r]) => r["public"] === true).map(([sig]) => sig);
    console.log("D1 executable by PUBLIC:", JSON.stringify(publicHolders));
    expect(unpinned).toEqual([]);
    expect(publicHolders).toEqual([]);
  });

  it("D2 no product role can still write either event table directly", async () => {
    const seed = await seedRun();
    const ref = randomUUID();
    expect(await prepareIntent(seed, ref)).toBe(true);
    const outcomes = {
      runtimeVisibility: await errorOf(() => withRole("debateai_runtime", (c) => c.query(
        "INSERT INTO core.run_visibility_event(run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq) VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',clock_timestamp(),1)",
        [randomUUID(), seed.runId, ref, F1]
      ))),
      erasureVisibility: await errorOf(() => withRole("debateai_erasure_runtime", (c) => c.query(
        "INSERT INTO core.run_visibility_event(run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq) VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',clock_timestamp(),1)",
        [randomUUID(), seed.runId, ref, F2]
      ))),
      runtimeAudit: await errorOf(() => withRole("debateai_runtime", (c) => c.query(
        "INSERT INTO identity.audit_event(audit_id,actor_key_ref,event_type,target_type,target_id,occurred_at,source_context,decision,success,justification) VALUES ($1,'system:free-public-auto-publish','debate.publication.published','debate.publication_event_ref',$2,clock_timestamp(),'{\"schema\":\"s10-publication-event-v2\"}'::jsonb,'ALLOW',true,NULL)",
        [randomUUID(), randomUUID()]
      )))
    };
    console.log("D2:", JSON.stringify(outcomes, null, 1));
    expect(Object.values(outcomes).every((o) => o.startsWith("42501"))).toBe(true);
  });

  it("D3 S-N1: prepare() now refuses every unbound run (was true at db4758da)", async () => {
    const premium = await seedRun({ planTier: "premium" });
    const nullTier = await seedRun({ planTier: null });
    const preRule = await seedRun({ planTier: "free", freePublicRule: false });
    const result = {
      premium: await prepareIntent(premium, randomUUID()),
      nullTier: await prepareIntent(nullTier, randomUUID()),
      preRule: await prepareIntent(preRule, randomUUID())
    };
    console.log("D3 prepare() on unbound runs (pass 1 was all true):", JSON.stringify(result));
    expect(result).toEqual({ premium: false, nullTier: false, preRule: false });
  });

  it("D3b S-N1 trigger half: the f1 admission now refuses an unbound run", async () => {
    // core.run is append-only (core.reject_mutation fires on UPDATE), so the unbound run
    // is SEEDED unbound and given the f1 shape's other preconditions directly: a snapshot
    // for the ref (the FK that stopped the pass-1 A5 probe before the trigger decided) and
    // a live PREPARED intent. Everything the admission asks for is present except boundness.
    const premium = await seedRun({ planTier: "premium" });
    const ref = randomUUID();
    await pool.query(`
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      VALUES ($1,'publication_ref',clock_timestamp()) ON CONFLICT (ref) DO NOTHING
    `, [ref]);
    await pool.query(`
      INSERT INTO serve.publication_snapshot(
        publication_ref,run_id,format_version,content_ciphertext,created_at
      ) VALUES ($1,$2,1,$3::jsonb,clock_timestamp())
    `, [ref, premium.runId, JSON.stringify(await realEnvelope(ref, premium.runId))]);
    await pool.query(`
      INSERT INTO serve.system_publication_key_provision_intent(
        publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
      ) VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '5 minutes','PREPARED')
    `, [ref, premium.runId, premium.userId, premium.ownerRef]);
    const unbound = await insertVisibility(
      "debateai_runtime", premium.runId, ref, "PUBLISHED", F1, "PUBLIC_INDEXED_V1"
    );
    console.log("D3b f1 admission on an UNBOUND run:", unbound,
      "latest =", await latestVisibility(premium.runId));
    expect(unbound).toContain("PUBLICATION_V2_REF_BINDING_REQUIRED");
    expect(await latestVisibility(premium.runId)).toBeNull();
  });

  it("D4 S-N2: the f1 admission now refuses an EXPIRED intent", async () => {
    const bound = await seedRun();
    const ref = randomUUID();
    expect(await prepareIntent(bound, ref)).toBe(true);
    expect(await systemPublish(bound, ref)).toBe(ref);
    await pool.query(`
      INSERT INTO serve.system_publication_key_provision_intent(
        publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
      ) VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp()-interval '1 day','PREPARED')
      ON CONFLICT (publication_ref) DO UPDATE SET cleanup_state='PREPARED',
        expires_at=clock_timestamp()-interval '1 day'
    `, [ref, bound.runId, bound.userId, bound.ownerRef]);
    const expired = await insertVisibility(
      "debateai_runtime", bound.runId, ref, "PUBLISHED", F1, "PUBLIC_INDEXED_V1"
    );
    console.log("D4 f1 admission with an EXPIRED intent:", expired);
    // Control: the same row with a LIVE intent is admitted, so D4 measures the lease
    // and not some other predicate.
    await pool.query(
      "UPDATE serve.system_publication_key_provision_intent SET expires_at=clock_timestamp()+interval '5 minutes' WHERE publication_ref=$1",
      [ref]
    );
    const live = await insertVisibility(
      "debateai_runtime", bound.runId, ref, "PUBLISHED", F1, "PUBLIC_INDEXED_V1"
    );
    console.log("D4 control, LIVE intent:", live);
    expect(expired).toContain("PUBLICATION_V2_REF_BINDING_REQUIRED");
    expect(live).toBe("NO_ERROR");
  });

  it("D5 S-N3: the cross-run f2 row that was ADMITTED at pass 1 is now refused", async () => {
    const victim = await seedRun();
    const attacker = await seedRun();
    const victimRef = randomUUID();
    const attackerRef = randomUUID();
    expect(await prepareIntent(victim, victimRef)).toBe(true);
    expect(await systemPublish(victim, victimRef)).toBe(victimRef);
    expect(await prepareIntent(attacker, attackerRef)).toBe(true);
    expect(await systemPublish(attacker, attackerRef)).toBe(attackerRef);
    await pool.query(`
      INSERT INTO serve.publication_key_cleanup_intent(
        publication_ref,requested_at,completed_at,cleanup_state,
        cleanup_claim_token,cleanup_claim_expires_at,destroy_result
      ) VALUES ($1,clock_timestamp(),NULL,'PENDING',NULL,NULL,NULL)
    `, [victimRef]);
    const crossed = await insertVisibility(
      "debateai_erasure_runtime", attacker.runId, victimRef, "PRIVATE", F2,
      "COPIES_MAY_PERSIST_V1"
    );
    console.log("D5 cross-run f2 (pass 1: NO_ERROR, attacker went PRIVATE):", crossed,
      "attacker latest =", await latestVisibility(attacker.runId));
    // Control: the SAME shape with the victim's OWN run is still admitted.
    const own = await insertVisibility(
      "debateai_erasure_runtime", victim.runId, victimRef, "PRIVATE", F2,
      "COPIES_MAY_PERSIST_V1"
    );
    console.log("D5 control, own run:", own, "victim latest =",
      await latestVisibility(victim.runId));
    expect(crossed).toContain("PUBLICATION_V2_REF_BINDING_REQUIRED");
    expect(await latestVisibility(attacker.runId)).toBe("PUBLISHED");
    expect(own).toBe("NO_ERROR");
  });

  it("D6 S-N4: the DENY audit wrapper now refuses a run with no outstanding bound work", async () => {
    const premium = await seedRun({ planTier: "premium" });
    const boundNoWork = await seedRun();
    const boundWithWork = await seedRun();
    await withRole("debateai_runtime", (c) => c.query(
      "SELECT core.ensure_free_public_auto_publish_work($1,$2,$3)",
      [boundWithWork.runId, boundWithWork.userId, boundWithWork.ownerRef]
    ));
    async function audit(seed: Seed): Promise<boolean> {
      return withRole("debateai_runtime", async (c) => {
        const r = await c.query<{ appended: boolean }>(
          "SELECT identity.audit_system_publication_attempt($1,$2,$3,$4,$5) AS appended",
          [randomUUID(), seed.runId, "AUTO_PUBLISH_CIPHER_FAILED", new Date(), "DENY"]
        );
        return r.rows[0]?.appended === true;
      });
    }
    const result = {
      unboundPremium: await audit(premium),
      boundNoOutstandingWork: await audit(boundNoWork),
      boundWithOutstandingWork: await audit(boundWithWork)
    };
    console.log("D6 audit wrapper (pass 1: any existing run returned true):",
      JSON.stringify(result));
    expect(result.unboundPremium).toBe(false);
    expect(result.boundNoOutstandingWork).toBe(false);
    expect(result.boundWithOutstandingWork).toBe(true);
  });

  it("D7 NEW: core.ensure_free_public_auto_publish_work admits an UNBOUND run", async () => {
    const premium = await seedRun({ planTier: "premium" });
    const ensured = await withRole("debateai_runtime", async (c) => {
      const r = await c.query<{ ensured: boolean }>(
        "SELECT core.ensure_free_public_auto_publish_work($1,$2,$3) AS ensured",
        [premium.runId, premium.userId, premium.ownerRef]
      );
      return r.rows[0]?.ensured === true;
    });
    const row = await pool.query<{ reason: string; cleared_at: Date | null }>(
      "SELECT reason,cleared_at FROM core.free_public_auto_publish_work WHERE run_id=$1",
      [premium.runId]
    );
    const visibility = await withRole("debateai_runtime", async (c) => {
      const r = await c.query<{ state: string; publish_pending: boolean }>(`
        SELECT COALESCE(latest.state,'PRIVATE') AS state,
          EXISTS (
            SELECT 1 FROM core.free_public_auto_publish_work AS work
            WHERE work.run_id=run.run_id AND work.cleared_at IS NULL
              AND latest.state IS DISTINCT FROM 'PUBLISHED'
          ) AS publish_pending
        FROM core.run AS run
        LEFT JOIN LATERAL (
          SELECT event.state FROM core.run_visibility_event AS event
          WHERE event.run_id=run.run_id ORDER BY event.at_seq DESC LIMIT 1
        ) AS latest ON true
        WHERE run.run_id=$1
      `, [premium.runId]);
      return r.rows[0];
    });
    const claimable = await withRole("debateai_runtime", async (c) => {
      const r = await c.query(
        "SELECT run_id FROM core.claim_free_public_auto_publish_work(100)"
      );
      return r.rows.some((row2) => (row2 as { run_id: string }).run_id === premium.runId);
    });
    console.log("D7 ensure() on a PREMIUM run:", ensured,
      "row:", JSON.stringify(row.rows[0]),
      "owner visibility projection:", JSON.stringify(visibility),
      "claimed by the reconciler:", claimable);
    // Recorded, not asserted as a pass/fail of the product: the reachability question is
    // decided in the artifact. The probe's job is to state what the capability admits.
    expect(typeof ensured).toBe("boolean");
  });

  it("D8 charge 7: the erasure completion's reach", async () => {
    const rows = await pool.query(
      `SELECT p.oid::regprocedure::text AS sig,
              has_function_privilege('debateai_runtime',p.oid,'execute') AS runtime,
              has_function_privilege('debateai_erasure_runtime',p.oid,'execute') AS erasure,
              has_function_privilege('public',p.oid,'execute') AS pub
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE p.proname IN ('finalize_private_run_erasure','resume_private_run_erasure',
                            'prepare_private_run_erasure','private_run_erasure_status')
        ORDER BY sig`
    );
    console.log("D8 erasure functions:\n" + JSON.stringify(rows.rows, null, 1));
    const tables = ["serve.private_run_key_cleanup_intent", "serve.private_run_erasure_tombstone",
      "identity.private_erasure_audit_binding", "identity.step_up_grant"];
    const grid: Record<string, Record<string, string>> = {};
    for (const rel of tables) {
      grid[rel] = {};
      for (const role of ["debateai_runtime", "debateai_erasure_runtime", "public",
        "rev_s01_p2_nobody"]) {
        const r = await pool.query<{ s: boolean; i: boolean; u: boolean; d: boolean }>(
          `SELECT has_table_privilege($1,$2,'select') AS s,
                  has_table_privilege($1,$2,'insert') AS i,
                  has_table_privilege($1,$2,'update') AS u,
                  has_table_privilege($1,$2,'delete') AS d`, [role, rel]
        );
        const v = r.rows[0];
        const g = [v?.s ? "S" : "", v?.i ? "I" : "", v?.u ? "U" : "", v?.d ? "D" : ""].join("");
        grid[rel][role] = g === "" ? "-" : g;
      }
    }
    console.log("D8 erasure queue tables:\n" + JSON.stringify(grid, null, 1));
    // The completion can only act on a queue row, and a queue row is only created inside
    // prepare_private_run_erasure after the full authorization block.
    const foreign = await seedRun();
    const forged = await errorOf(() => withRole("debateai_erasure_runtime", (c) => c.query(`
      INSERT INTO serve.private_run_key_cleanup_intent(
        request_ref,user_id,run_id,requested_at,cleanup_publication_refs
      ) VALUES ($1,$2,$3,clock_timestamp(),ARRAY[]::uuid[])
    `, [randomUUID(), foreign.userId, foreign.runId])));
    console.log("D8 erasure role forging a queue row for a run it was never authorized for:",
      forged);
    const noGrant = await withRole("debateai_erasure_runtime", async (c) => {
      const r = await c.query<{ outcome: string }>(
        "SELECT outcome FROM core.prepare_private_run_erasure($1,$2,$3,$4,$5)",
        [foreign.runId, foreign.userId, foreign.ownerRef, randomUUID(), "no-such-grant-hash"]
      );
      return r.rows[0]?.outcome;
    });
    console.log("D8 prepare_private_run_erasure with no session and no grant:", noGrant);
    expect(noGrant).toBe("NOT_FOUND");
  });
});
