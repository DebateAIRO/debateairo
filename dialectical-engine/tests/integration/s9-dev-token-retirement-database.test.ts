import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresLegacyRunClaimRepository,
  RunRepository
} from "@debateai/db";
import type { AuditContextHasher } from "@debateai/crypto";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database:TestDatabase;
const migrationDirectory=new URL("../../migrations/",import.meta.url);
const source=Object.freeze({ ip:"192.0.2.99",userAgent:"S9 browser",requestId:"s9:test" });
const auditHasher=Object.freeze({
  hashSourceIp:async (value:string)=>createHash("sha256").update(`ip:${value}`).digest("hex"),
  hashUserAgent:async (value:string)=>createHash("sha256").update(`ua:${value}`).digest("hex")
}) as AuditContextHasher;
const sourceContext=Object.freeze({
  ipArgon2id:`argon2id-audit:v1:${createHash("sha256").update(`ip:${source.ip}`).digest("hex")}`,
  userAgentArgon2id:`argon2id-audit:v1:${createHash("sha256").update(`ua:${source.userAgent}`).digest("hex")}`
});

async function migrateBeforeCutover():Promise<void> {
  const names=(await readdir(migrationDirectory))
    .filter((name)=>/^\d+.*\.sql$/.test(name) && name<"0041_dev_token_retirement.sql")
    .sort();
  for (const name of names) {
    await database.pool.query(await readFile(new URL(name,migrationDirectory),"utf8"));
  }
}

async function ensureCutoverMigration():Promise<void> {
  const installed=await database.pool.query<{ installed:boolean }>(
    "SELECT to_regclass('core.legacy_run_cutover') IS NOT NULL AS installed"
  );
  if (!installed.rows[0]?.installed) {
    await database.pool.query(await readFile(
      new URL("0041_dev_token_retirement.sql",migrationDirectory),"utf8"
    ));
  }
}

async function legacyRun(token:string,label:string):Promise<string> {
  const askerId=`asker:${createHash("sha256").update(token).digest("hex")}`;
  return new RunRepository(database.pool).startRun({
    questionLine:`S9 ${label}`,
    askContract:{ audience:"s9-test" },
    principal:{ kind:"legacy",legacyAskerId:askerId },
    sessionId:randomUUID(),callerScope:"ASKER",
    asOf:new Date("2026-08-25T00:00:00.000Z"),
    askerRiskTier:"casual",effectiveRiskTier:"casual",tierSource:"ASKER",
    tierProvenanceRef:"s9:test",compositionBudgetTier:"low",
    depthParams:{ depth:1 },discoveredPanel:fixtureDiscoveredPanel(1),
    strangerSampleRate:1,envelopeBasis:{ source:"s9:test" },
    registerVersion:1,batteryVersion:"s9:test",batteryRows:[]
  });
}

async function identity(label:string):Promise<Readonly<{
  userId:string;ownerRef:string;sessionId:string;sessionTokenHash:string;
}>> {
  const userId=randomUUID();
  const ownerRef=randomUUID();
  const sessionId=randomUUID();
  const tokenHash=`sha256:${randomBytes(32).toString("hex")}`;
  await database.pool.query(
    `INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'s9-password',$3,$4,$5,
      'active',clock_timestamp(),clock_timestamp())`,
    [userId,randomBytes(32),`s9-${label}-${randomUUID()}`,randomUUID(),ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp())`,
    [sessionId,userId,tokenHash,`sha256:${randomBytes(32).toString("hex")}`]
  );
  return Object.freeze({ userId,ownerRef,sessionId,sessionTokenHash:tokenHash });
}

beforeAll(async ()=>{
  database=await startTestDatabase();
  await migrateBeforeCutover();
},120_000);
afterAll(async ()=>database?.stop());

describe("S9 dev-token retirement on real PostgreSQL",()=>{
  it("snapshots every event-less run and claims an exact proof once without moving unrelated runs",async ()=>{
    const exactToken=`legacy:${randomUUID()}`;
    const otherToken=`legacy:${randomUUID()}`;
    const exactRuns=await Promise.all([
      legacyRun(exactToken,"one"),legacyRun(exactToken,"two"),legacyRun(exactToken,"three")
    ]);
    const unrelatedRun=await legacyRun(otherToken,"unrelated");
    const legacySessionUserId=randomUUID();
    const legacySessionId=randomUUID();
    await database.pool.query(
      `INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
        adult_affirmed_at,created_at
      ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'s9-password',$3,$4,$5,
        'active',clock_timestamp(),clock_timestamp())`,
      [legacySessionUserId,randomBytes(32),`s9-legacy-session-${randomUUID()}`,
        randomUUID(),randomUUID()]
    );
    await database.pool.query(
      `INSERT INTO identity.session(
        session_id,user_id,token_hash,binding_context,created_at,last_seen_at,
        idle_expires_at,absolute_expires_at
      ) VALUES ($1,$2,$3,'{}'::jsonb,clock_timestamp(),clock_timestamp(),
        clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`,
      [legacySessionId,legacySessionUserId,`legacy-session:${randomUUID()}`]
    );
    const claimant=await identity("claimant");
    await database.pool.query(await readFile(
      new URL("0041_dev_token_retirement.sql",migrationDirectory),"utf8"
    ));
    const cutover=await database.pool.query<{ count:string }>(
      "SELECT count(*)::text AS count FROM core.legacy_run_cutover"
    );
    expect(cutover.rows[0]?.count).toBe("4");
    const initialDispositions=await database.pool.query<{ disposition:string;count:string }>(
      `SELECT unclaimed_disposition AS disposition,count(*)::text AS count
       FROM core.legacy_run_cutover GROUP BY unclaimed_disposition`
    );
    expect(initialDispositions.rows).toEqual([
      { disposition:"ORPHANED_PRIVATE_CLAIMABLE",count:"4" }
    ]);
    const retiredSession=await database.pool.query<{
      revoked_at:Date|null;csrf_token_hash:string|null;last_mfa_at:Date|null;
    }>(
      `SELECT revoked_at,csrf_token_hash,last_mfa_at
       FROM identity.session WHERE session_id=$1`,[legacySessionId]
    );
    expect(retiredSession.rows[0]).toMatchObject({
      revoked_at:expect.any(Date),
      csrf_token_hash:expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      last_mfa_at:expect.any(Date)
    });
    const nullability=await database.pool.query<{ column_name:string;is_nullable:string }>(
      `SELECT column_name,is_nullable FROM information_schema.columns
       WHERE table_schema='identity' AND table_name='session'
         AND column_name IN ('csrf_token_hash','last_mfa_at')
       ORDER BY column_name`
    );
    expect(nullability.rows).toEqual([
      { column_name:"csrf_token_hash",is_nullable:"NO" },
      { column_name:"last_mfa_at",is_nullable:"NO" }
    ]);

    const repository=new PostgresLegacyRunClaimRepository(database.pool,auditHasher);
    await expect(repository.claim({ ...claimant,legacyToken:exactToken,source }))
      .resolves.toEqual({ status:"CLAIMED",claimedCount:3 });
    const claimed=await database.pool.query<{ run_id:string;owner_ref:string }>(
      `SELECT event.run_id,event.owner_ref
       FROM core.run_ownership_event AS event
       WHERE event.run_id=ANY($1::uuid[]) ORDER BY event.run_id`,[exactRuns]
    );
    expect(claimed.rows).toHaveLength(3);
    expect(new Set(claimed.rows.map((row)=>row.owner_ref))).toEqual(new Set([claimant.ownerRef]));
    expect(await database.pool.query(
      "SELECT 1 FROM core.run_ownership_event WHERE run_id=$1",[unrelatedRun]
    )).toHaveProperty("rowCount",0);
    const terminalClassification=await database.pool.query<{
      status:string;count:string;
    }>(
      `SELECT CASE WHEN claim.run_id IS NULL THEN 'EXPLICITLY_ORPHANED'
                   ELSE 'CLAIMED' END AS status,
              count(*)::text AS count
       FROM core.legacy_run_cutover AS cutover
       LEFT JOIN core.legacy_run_claim AS claim ON claim.run_id=cutover.run_id
       GROUP BY status ORDER BY status`
    );
    expect(terminalClassification.rows).toEqual([
      { status:"CLAIMED",count:"3" },
      { status:"EXPLICITLY_ORPHANED",count:"1" }
    ]);

    await expect(repository.claim({ ...claimant,legacyToken:exactToken,source }))
      .resolves.toEqual({ status:"NO_MATCH",claimedCount:0 });
    expect((await database.pool.query<{ count:string }>(
      "SELECT count(*)::text AS count FROM core.run_ownership_event WHERE run_id=ANY($1::uuid[])",
      [exactRuns]
    )).rows[0]?.count).toBe("3");
    const audits=await database.pool.query<{ event_type:string;success:boolean }>(
      `SELECT event_type,success FROM identity.audit_event
       WHERE event_type LIKE 'debate.legacy_run.%' ORDER BY occurred_at,audit_id`
    );
    expect(audits.rows).toEqual([
      { event_type:"debate.legacy_run.claimed",success:true },
      { event_type:"debate.legacy_run.claim_denied",success:false }
    ]);

    await database.pool.query(await readFile(
      new URL("0041_dev_token_retirement.sql",migrationDirectory),"utf8"
    ));
    const replayState=await database.pool.query<{
      cutovers:string;claims:string;markers:string;audits:string;
    }>(
      `SELECT
        (SELECT count(*)::text FROM core.legacy_run_cutover) AS cutovers,
        (SELECT count(*)::text FROM core.legacy_run_claim) AS claims,
        (SELECT count(*)::text FROM core.legacy_run_cutover_marker) AS markers,
        (SELECT count(*)::text FROM identity.audit_event
          WHERE event_type LIKE 'debate.legacy_run.%') AS audits`
    );
    expect(replayState.rows).toEqual([{
      cutovers:"4",claims:"3",markers:"1",audits:"2"
    }]);
  });

  it("linearizes competing claimers and excludes post-cutover legacy runs",async ()=>{
    const token=`legacy-race:${randomUUID()}`;
    // Explicitly represent a second pre-existing orphan; production creates no
    // new legacy run after the cutover.
    const runId=await legacyRun(token,"race");
    await ensureCutoverMigration();
    await database.pool.query(
      `INSERT INTO core.legacy_run_cutover(run_id,marked_at)
       VALUES ($1,clock_timestamp()) ON CONFLICT (run_id) DO NOTHING`,
      [runId]
    );
    const [left,right]=await Promise.all([identity("left"),identity("right")]);
    const repository=new PostgresLegacyRunClaimRepository(database.pool,auditHasher);
    const outcomes=await Promise.all([
      repository.claim({ ...left,legacyToken:token,source }),
      repository.claim({ ...right,legacyToken:token,source })
    ]);
    expect(outcomes.map((row)=>row.status).sort()).toEqual(["CLAIMED","NO_MATCH"]);
    const owners=await database.pool.query<{ owner_ref:string }>(
      "SELECT owner_ref FROM core.run_ownership_event WHERE run_id=$1",[runId]
    );
    expect(owners.rows).toHaveLength(1);

    const lateToken=`late:${randomUUID()}`;
    const lateRun=await legacyRun(lateToken,"late");
    await expect(repository.claim({ ...left,legacyToken:lateToken,source }))
      .resolves.toEqual({ status:"NO_MATCH",claimedCount:0 });
    expect((await database.pool.query(
      "SELECT 1 FROM core.run_ownership_event WHERE run_id=$1",[lateRun]
    )).rowCount).toBe(0);
  });

  it("denies ordinary runtime ownership transfer and keeps the proof out of durable rows",async ()=>{
    const token=`secret-proof:${randomUUID()}`;
    const runId=await legacyRun(token,"acl");
    await ensureCutoverMigration();
    await database.pool.query(
      `INSERT INTO core.legacy_run_cutover(run_id,marked_at)
       VALUES ($1,clock_timestamp()) ON CONFLICT (run_id) DO NOTHING`,
      [runId]
    );
    const claimant=await identity("acl");
    const client=await database.pool.connect();
    try {
      await client.query("SET ROLE debateai_runtime");
      await expect(client.query(
        "SELECT core.append_run_ownership_event($1,$2)",[runId,claimant.ownerRef]
      )).rejects.toMatchObject({ code:"42501" });
      await expect(client.query(
        `INSERT INTO core.legacy_run_claim(run_id,owner_ref,claimed_at,audit_id)
         VALUES ($1,$2,clock_timestamp(),$3)`,
        [runId,claimant.ownerRef,randomUUID()]
      )).rejects.toMatchObject({ code:"42501" });
      const invalidSession=await client.query<{
        claim_status:string;claimed_count:number;
      }>(
        "SELECT * FROM core.claim_legacy_runs($1,$2,$3,$4,$5,$6::jsonb)",
        [randomUUID(),randomUUID(),randomUUID(),
          `sha256:${randomBytes(32).toString("hex")}`,token,JSON.stringify(sourceContext)]
      );
      expect(invalidSession.rows).toEqual([{
        claim_status:"SESSION_INVALID",claimed_count:0
      }]);
      const claimed=await client.query<{ claim_status:string;claimed_count:number }>(
        "SELECT * FROM core.claim_legacy_runs($1,$2,$3,$4,$5,$6::jsonb)",
        [claimant.userId,claimant.ownerRef,claimant.sessionId,
          claimant.sessionTokenHash,token,JSON.stringify(sourceContext)]
      );
      expect(claimed.rows).toEqual([{ claim_status:"CLAIMED",claimed_count:1 }]);
    } finally {
      await client.query("RESET ROLE");
      client.release();
    }
    const durable=await database.pool.query<{ found:boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM core.legacy_run_cutover AS cutover
        WHERE to_jsonb(cutover)::text LIKE '%'||$1||'%'
        UNION ALL
        SELECT 1 FROM core.legacy_run_claim AS claim
        WHERE to_jsonb(claim)::text LIKE '%'||$1||'%'
        UNION ALL
        SELECT 1 FROM identity.audit_event AS audit
        WHERE to_jsonb(audit)::text LIKE '%'||$1||'%'
      ) AS found`,[token]
    );
    expect(durable.rows[0]?.found).toBe(false);
  });
});
