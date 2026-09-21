// TEMPORARY REVIEW FIXTURE — REV-S01-p1-security-data-safety. Deleted before handoff.
// What a system-published snapshot exposes (R-6, R-7, R-20, R-22) and the guard mutants (charge 4).
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Answer } from "@debateai/contract";
import { loadKek, MemoryPublicationKeyStore, PublicationCipher } from "@debateai/crypto";
import { migrate, PostgresPublicationRepository, type AuthSourceContext } from "@debateai/db";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let pool: Pool;
let repository: PostgresPublicationRepository;
let application: PostgresPublicationApplication;

const hasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as Parameters<typeof PostgresPublicationRepository.prototype.constructor>[1];

type Seed = Readonly<{
  runId: string; userId: string; ownerRef: string; pseudonym: string;
  auditToken: string; sessionId: string; email: string;
}>;

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

async function seedRun(input: Readonly<{
  planTier?: "free" | "premium" | null; freePublicRule?: boolean;
}> = {}): Promise<Seed> {
  const runId = randomUUID();
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const sessionId = randomUUID();
  const pseudonym = `Public Thinker ${runId.slice(0, 8)}`;
  const email = `real.identity.${runId.slice(0, 8)}@example.test`;
  const planTier = input.planTier === undefined ? "free" : input.planTier;
  const freePublicRule = input.freePublicRule ?? true;
  await pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      password_hash,pseudonym,state,adult_affirmed_at,audit_token,owner_ref
    ) VALUES ($1::uuid,decode(md5(($1::uuid)::text)||md5(($1::uuid)::text||':email'),'hex'),
      jsonb_build_object('plaintext',$5::text),'{}'::jsonb,
      'test-password-hash',$2,'active',clock_timestamp(),$3,$4)
  `, [userId, pseudonym, auditToken, ownerRef, email]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query(`
      INSERT INTO identity.session(
        session_id,user_id,token_hash,binding_context,idle_expires_at,
        absolute_expires_at,csrf_token_hash,last_mfa_at
      ) VALUES ($1::uuid,$2,md5(($1::uuid)::text)||md5(($1::uuid)::text||':t'),'{}'::jsonb,
        clock_timestamp()+interval '1 hour',
        clock_timestamp()+interval '2 hours',
        'sha256:'||md5(($1::uuid)::text)||md5(($1::uuid)::text||':c'),
        clock_timestamp())
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
    `, [runId, ownerRef, sessionId, planTier, freePublicRule]);
    await client.query(`
      INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq)
      VALUES ($1,$2,ledger.allocate_sequence())
    `, [runId, ownerRef]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { runId, userId, ownerRef, pseudonym, auditToken, sessionId, email };
}

// A CLEAN answer: nothing the owner typed carries an identifier, so anything the
// publish machinery adds is visible. (A contaminated answer proves nothing: the
// owner-driven path copies question and summary text verbatim too.)
function answerFor(seed: Seed, terminal: "SERVED" | "BLOCKED" = "SERVED"): Answer {
  return {
    run_ref: seed.runId,
    question_line: "Does a public square need a gatekeeper?",
    terminal,
    verdict_state: "SUPPORTED",
    confidence_band: "high",
    composed_text: [{ text: "A public answer with no identifier in it." }],
    badges: [],
    residual_objections: [],
    reversal_point: "New evidence",
    as_of: "2026-09-21T00:00:00.000Z",
    nodes: [],
    edges: []
  } as unknown as Answer;
}

beforeAll(async () => {
  database = await startTestDatabase();
  pool = database.pool as unknown as Pool;
  await migrate(database.pool);
  repository = new PostgresPublicationRepository(database.pool as never, hasher as never);
  application = new PostgresPublicationApplication(
    repository,
    new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xc8)))),
    () => new Date("2026-09-21T00:00:00.000Z")
  );
}, 300_000);

afterAll(async () => {
  await database?.stop();
});

describe("REV-S01-p1 security: what a system publish exposes", () => {
  it("B1 R-6/R-7: the system snapshot carries the pseudonym and no owner identifier", async () => {
    const seed = await seedRun();
    await application.tryAutoPublish({
      runId: seed.runId, answer: answerFor(seed),
      userId: seed.userId, ownerRef: seed.ownerRef
    });
    const refs = await repository.listPublicRefs(100, 0);
    console.log("B1 public refs:", JSON.stringify(refs.refs), "total", refs.total);
    const ref = refs.refs[0];
    expect(ref).toBeDefined();
    const debate = await application.readPublicDebate(ref!);
    const json = JSON.stringify(debate);
    const leaks = {
      author_pseudonym: debate?.author_pseudonym,
      pseudonymMatches: debate?.author_pseudonym === seed.pseudonym,
      containsUserId: json.includes(seed.userId),
      containsOwnerRef: json.includes(seed.ownerRef),
      containsSessionId: json.includes(seed.sessionId),
      containsEmail: json.includes(seed.email),
      containsAuditToken: json.includes(seed.auditToken),
      containsRunId: json.includes(seed.runId)
    };
    console.log("B1 leak scan:", JSON.stringify(leaks, null, 1));
    console.log("B1 snapshot keys:", JSON.stringify(Object.keys(debate ?? {})));
    console.log("B1 answer keys:", JSON.stringify(Object.keys((debate as never as {
      answer: Record<string, unknown>;
    })?.answer ?? {})));
    expect(leaks.pseudonymMatches).toBe(true);
    expect(leaks.containsUserId).toBe(false);
    expect(leaks.containsOwnerRef).toBe(false);
    expect(leaks.containsSessionId).toBe(false);
    expect(leaks.containsAuditToken).toBe(false);
  });

  it("B2 the audit row's actor_ciphertext carries no owner identifier", async () => {
    const rows = await pool.query<{
      actor_key_ref: string; actor_ciphertext: unknown; target_id: string;
    }>(
      `SELECT actor_key_ref,actor_ciphertext,target_id FROM identity.audit_event
        WHERE actor_key_ref='system:free-public-auto-publish' ORDER BY occurred_at`
    );
    console.log("B2 system audit rows:", JSON.stringify(rows.rows, null, 1));
    expect(rows.rows.length).toBeGreaterThan(0);
  });

  it("B3 R-22: a pre-slice-shaped snapshot still reads 200 and still lists", async () => {
    // Built with the exact key set PublicDebateSchema carried before this slice.
    const seed = await seedRun({ planTier: "premium" });
    const ref = randomUUID();
    const legacy = {
      public_ref: ref,
      author_pseudonym: seed.pseudonym,
      question: "A debate published before this slice shipped",
      published_at: "2026-01-01T00:00:00.000Z",
      answer: {
        terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true,
        confidence_band: "moderate", summary_segments: [{ text: "older public answer" }],
        badges: [], residual_objections: [], reversal_point: "new evidence",
        as_of: "2026-01-01T00:00:00.000Z", nodes: [], edges: [], tree_included: true
      }
    };
    const cipher = new PublicationCipher(
      new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xc8)))
    );
    const prepared = await cipher.create(ref, seed.runId);
    const ciphertext = prepared.encrypt(legacy);
    prepared.close();
    await pool.query(`
      INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
      VALUES ($1,'publication_ref',clock_timestamp()) ON CONFLICT (ref) DO NOTHING
    `, [ref]);
    await pool.query(`
      INSERT INTO serve.publication_snapshot(
        publication_ref,run_id,format_version,content_ciphertext,created_at
      ) VALUES ($1,$2,1,$3::jsonb,'2026-01-01T00:00:00.000Z')
    `, [ref, seed.runId, JSON.stringify(ciphertext)]);
    // This is historical-state setup, not an attempt to exercise today's write
    // authorization. Load the already-published row without asking the current
    // f1 admission to authorize a Premium system publication it now rejects.
    await pool.query("ALTER TABLE core.run_visibility_event DISABLE TRIGGER USER");
    try {
      await pool.query(`
        INSERT INTO core.run_visibility_event(
          run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
          actor_ref_version,warning_version,occurred_at,at_seq
        ) VALUES ($1,$2,$3,'PUBLISHED','00000000-0000-4000-8000-0000000000f1',2,
          'PUBLIC_INDEXED_V1','2026-01-01T00:00:00.000Z',ledger.allocate_sequence())
      `, [randomUUID(), seed.runId, ref]);
    } finally {
      await pool.query("ALTER TABLE core.run_visibility_event ENABLE TRIGGER USER");
    }
    const application2 = new PostgresPublicationApplication(repository, cipher);
    const read = await application2.readPublicDebate(ref);
    const listed = await repository.listPublicRefs(100, 0);
    console.log("B3 pre-slice snapshot read:", read === null ? "NULL (404)" : "200",
      "listed:", listed.refs.includes(ref));
    expect(read).not.toBeNull();
    expect(listed.refs).toContain(ref);
  });

  it("B4 R-8: a BLOCKED answer is never published and leaves no outstanding work", async () => {
    const seed = await seedRun();
    await application.tryAutoPublish({
      runId: seed.runId, answer: answerFor(seed, "BLOCKED"),
      userId: seed.userId, ownerRef: seed.ownerRef
    });
    const visibility = await repository.readOwnedVisibility(
      seed.runId, seed.userId, seed.ownerRef
    );
    const outstanding = await repository.countAutoPublishWork(seed.runId);
    console.log("B4 BLOCKED:", JSON.stringify(visibility), "outstanding:", outstanding);
    expect(visibility?.state).toBe("PRIVATE");
    expect(outstanding).toBe(0);
  });

  it("B5 charge-4 mutants: each transition guard, removed, turns its named case RED", async () => {
    const captured = (await pool.query<{ def: string }>(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc
        WHERE proname='transition_system_run_publication' LIMIT 1`
    )).rows[0]?.def;
    expect(typeof captured).toBe("string");

    async function withMutant<T>(
      strip: (definition: string) => string, use: () => Promise<T>
    ): Promise<T> {
      const mutant = strip(captured!);
      expect(mutant).not.toBe(captured);
      await pool.query(mutant);
      try {
        return await use();
      } finally {
        await pool.query(captured!); // restore FROM the captured state
      }
    }

    async function directIntent(seed: Seed, ref: string): Promise<void> {
      await pool.query(`
        INSERT INTO core.publication_ref_tombstone(ref,ref_kind,created_at)
        VALUES ($1,'publication_ref',clock_timestamp()) ON CONFLICT (ref) DO NOTHING
      `, [ref]);
      await pool.query(`
        INSERT INTO serve.system_publication_key_provision_intent(
          publication_ref,run_id,user_id,owner_ref,requested_at,expires_at,cleanup_state
        ) VALUES ($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+interval '5 minutes','PREPARED')
      `, [ref, seed.runId, seed.userId, seed.ownerRef]);
    }

    const mutantCipher = new PublicationCipher(
      new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xc9)))
    );
    const envelopes = new Map<string, unknown>();
    async function envelopeFor(seed: Seed, ref: string): Promise<unknown> {
      const cached = envelopes.get(ref);
      if (cached !== undefined) return cached;
      const prepared = await mutantCipher.create(ref, seed.runId);
      try {
        const envelope = prepared.encrypt({
          public_ref: ref, author_pseudonym: seed.pseudonym,
          question: "mutant probe", published_at: "2026-09-21T00:00:00.000Z",
          answer: {
            terminal: "SERVED", verdict: "SUPPORTED", verdict_available: true,
            confidence_band: "high", summary_segments: [{ text: "mutant" }],
            badges: [], residual_objections: [], reversal_point: "new evidence",
            as_of: "2026-09-21T00:00:00.000Z", nodes: [], edges: [], tree_included: true
          }
        });
        envelopes.set(ref, envelope);
        return envelope;
      } finally {
        prepared.close();
      }
    }

    async function transition(seed: Seed, ref: string): Promise<string | null> {
      try {
        return await transitionOrThrow(seed, ref);
      } catch (error) {
        const e = error as { code?: string; message?: string };
        return `THREW ${e.code ?? "?"}:${e.message ?? ""}` as unknown as string;
      }
    }

    async function transitionOrThrow(seed: Seed, ref: string): Promise<string | null> {
      const envelope = await envelopeFor(seed, ref);
      return withRole("debateai_runtime", async (c) => {
        const r = await c.query<{ publication_ref: string | null }>(`
          SELECT core.transition_system_run_publication($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
            AS publication_ref
        `, [
          randomUUID(), seed.runId, seed.userId, seed.ownerRef, ref, seed.pseudonym,
          JSON.stringify(envelope), new Date(), randomUUID(), randomUUID()
        ]);
        return r.rows[0]?.publication_ref ?? null;
      });
    }

    // M1 — the bound guard.
    const premium = await seedRun({ planTier: "premium" });
    const nullTier = await seedRun({ planTier: null });
    const preRule = await seedRun({ planTier: "free", freePublicRule: false });
    const m1Refs = [randomUUID(), randomUUID(), randomUUID()] as const;
    await directIntent(premium, m1Refs[0]);
    await directIntent(nullTier, m1Refs[1]);
    await directIntent(preRule, m1Refs[2]);
    const m1Baseline = {
      premium: await transition(premium, m1Refs[0]),
      nullTier: await transition(nullTier, m1Refs[1]),
      preRule: await transition(preRule, m1Refs[2])
    };
    const m1Mutant = await withMutant(
      (d) => d.replace(
        /IF NOT core\.run_is_free_public_bound\(p_run_id\) THEN[\s\S]*?END IF;/,
        "IF false THEN RETURN NULL; END IF;"
      ),
      async () => ({
        premium: await transition(premium, m1Refs[0]),
        nullTier: await transition(nullTier, m1Refs[1]),
        preRule: await transition(preRule, m1Refs[2])
      })
    );
    console.log("M1 bound guard — baseline:", JSON.stringify(m1Baseline));
    console.log("M1 bound guard — mutant  :", JSON.stringify(m1Mutant));

    // M2 — the erased guard (run_private_content_is_live).
    const erased = await seedRun();
    await pool.query(`
      INSERT INTO serve.private_run_key_cleanup_intent(
        request_ref,user_id,run_id,requested_at,cleanup_publication_refs
      ) VALUES ($1,$2,$3,clock_timestamp(),ARRAY[]::uuid[])
    `, [randomUUID(), erased.userId, erased.runId]);
    const m2Ref = randomUUID();
    await directIntent(erased, m2Ref);
    const m2Baseline = await transition(erased, m2Ref);
    const m2Mutant = await withMutant(
      (d) => d.replace(
        /IF NOT core\.run_private_content_is_live\(p_run_id\) THEN[\s\S]*?END IF;/,
        "IF false THEN RETURN NULL; END IF;"
      ),
      async () => transition(erased, m2Ref)
    );
    console.log("M2 erased guard — baseline:", m2Baseline, "mutant:", m2Mutant);

    // M3 — the already-PUBLISHED guard.
    const twice = await seedRun();
    const firstRef = randomUUID();
    await directIntent(twice, firstRef);
    expect(await transition(twice, firstRef)).toBe(firstRef);
    const secondRef = randomUUID();
    await directIntent(twice, secondRef);
    const m3Baseline = await transition(twice, secondRef);
    const m3Mutant = await withMutant(
      (d) => d.replace(
        /IF v_latest_state='PUBLISHED' THEN[\s\S]*?END IF;/,
        "IF false THEN RETURN NULL; END IF;"
      ),
      async () => transition(twice, secondRef)
    );
    const snapshots = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM serve.publication_snapshot WHERE run_id=$1",
      [twice.runId]
    );
    console.log("M3 second-publish guard — baseline:", m3Baseline, "mutant:", m3Mutant,
      "snapshots now:", snapshots.rows[0]?.count);

    const restored = (await pool.query<{ def: string }>(
      `SELECT pg_get_functiondef(oid) AS def FROM pg_proc
        WHERE proname='transition_system_run_publication' LIMIT 1`
    )).rows[0]?.def;
    console.log("B5 function restored byte-identical:", restored === captured);
    expect(restored).toBe(captured);
    expect(m1Baseline).toEqual({ premium: null, nullTier: null, preRule: null });
    expect(m2Baseline).toBeNull();
    expect(m3Baseline).toBeNull();
  });
});

export type { AuthSourceContext };
