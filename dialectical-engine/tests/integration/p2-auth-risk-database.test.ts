import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  encrypt,
  generateDek,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "@debateai/crypto";
import {
  authenticationRiskSignalAad,
  createPool,
  migrate,
  PostgresAuthenticationRiskSignalRepository
} from "@debateai/db";
import { RECOVERY_POLICY_REGISTER_ROW } from "@debateai/register";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database:TestDatabase;
const userKeys=new Map<string,Buffer>();
const loadedUsers:string[]=[];
const AUTHENTICATION_RISK_SIGNAL_RETENTION_MS=
  RECOVERY_POLICY_REGISTER_ROW.value.risk_signals.raw_signal_retention_ms;
const MAX_AUTHENTICATION_RISK_SIGNAL_SCAN=
  RECOVERY_POLICY_REGISTER_ROW.value.risk_signals.maximum_evaluator_signals;
const users:ReadableUserDekStore=Object.freeze({
  async store(userId:string,dek:Uint8Array){userKeys.set(userId,Buffer.from(dek));},
  async load(userId:string){
    loadedUsers.push(userId);
    const key=userKeys.get(userId);
    if(key===undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(key);
  },
  async exists(userId:string){return userKeys.has(userId);},
  async destroy(userId:string){
    const key=userKeys.get(userId);
    if(key===undefined) return "ALREADY_ABSENT";
    key.fill(0);userKeys.delete(userId);return "DESTROYED";
  }
});
const auditContext=Object.freeze({
  async hashSourceIp(value:string){return value.includes("198.51.100")?"1".repeat(64):"2".repeat(64);},
  async hashUserAgent(value:string){return value.includes("alpha")?"3".repeat(64):"4".repeat(64);}
}) as unknown as AuditContextHasher;

async function account(label:string){
  const userId=randomUUID();
  const requestId=randomUUID();
  const publicHandle=randomUUID();
  const generic=JSON.stringify({v:1,keyId:`user-dek:${userId}`,nonce:"AA==",ct:"AA==",tag:"AA=="});
  const client=await database.pool.connect();
  try{
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO identity."user"(
        user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
        password_hash,pseudonym,state,adult_affirmed_at,created_at
      ) VALUES($1,$2,$3::jsonb,$3::jsonb,'hash',$4,'active',clock_timestamp(),clock_timestamp())
    `,[userId,randomBytes(32),generic,`risk-${label}`]);
    await client.query(`
      INSERT INTO identity.account_recovery_binding(recovery_request_id,user_id)
      VALUES($1,$2)
    `,[requestId,userId]);
    await client.query(`
      INSERT INTO identity.account_recovery_request(
        recovery_request_id,public_handle,channel_refs_ciphertext
      ) VALUES($1,$2,$3::jsonb)
    `,[requestId,publicHandle,generic]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}
  finally{client.release();}
  const dek=generateDek();await users.store(userId,dek);dek.fill(0);
  return {userId,publicHandle};
}

beforeAll(async()=>{database=await startTestDatabase();await migrate(database.pool);},120_000);
afterAll(async()=>{
  for(const key of userKeys.values()) key.fill(0);
  userKeys.clear();await database?.stop();
});

describe("P2-08 authentication risk persistence on real PostgreSQL",()=>{
  it("keeps recovery-scoped signals encrypted, cross-account isolated, and fixed-retention",async()=>{
    const alpha=await account(`alpha-${randomUUID()}`);
    const beta=await account(`beta-${randomUUID()}`);
    const repository=new PostgresAuthenticationRiskSignalRepository(
      database.pool,auditContext,users,AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    );
    await expect(repository.recordForRecovery({
      publicHandle:alpha.publicHandle,kind:"RECOVERY_STARTED",
      source:{ip:"198.51.100.1",userAgent:"alpha",requestId:randomUUID()}
    })).resolves.toBe("recorded");
    await expect(repository.recordForRecovery({
      publicHandle:beta.publicHandle,kind:"RECOVERY_PROOF_FAILED",
      source:{ip:"203.0.113.2",userAgent:"beta",requestId:randomUUID()}
    })).resolves.toBe("recorded");

    const alphaSummary=await repository.evaluateForRecovery(alpha.publicHandle);
    expect(alphaSummary).toMatchObject({signalCount:1,counts:{RECOVERY_STARTED:1}});
    const rows=await database.pool.query<{
      user_id:string;context_ciphertext:Record<string,unknown>;
      observed_at:Date;expires_at:Date;
    }>(`SELECT user_id,context_ciphertext,observed_at,expires_at
        FROM identity.authentication_risk_signal ORDER BY user_id`);
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows.map(row=>row.user_id).sort()).toEqual([alpha.userId,beta.userId].sort());
    for(const row of rows.rows){
      expect(Object.keys(row.context_ciphertext).sort()).toEqual(["ct","keyId","nonce","tag","v"]);
      expect(JSON.stringify(row.context_ciphertext)).not.toContain("198.51.100");
      expect(row.expires_at.getTime()-row.observed_at.getTime())
        .toBe(AUTHENTICATION_RISK_SIGNAL_RETENTION_MS);
    }
  });

  it("derives login signals from the live session and denies invalid session scope",async()=>{
    const subject=await account(`session-${randomUUID()}`);
    const tokenHash=`sha256:${randomBytes(32).toString("hex")}`;
    const csrfHash=`sha256:${randomBytes(32).toString("hex")}`;
    const bindingHash=`binding-${randomUUID()}`;
    const now=new Date();
    await database.pool.query(`
      INSERT INTO identity.session(
        user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,
        idle_expires_at,absolute_expires_at,last_mfa_at
      ) VALUES($1,$2,$3,$4::jsonb,$5,$5,$6,$7,$5)
    `,[
      subject.userId,tokenHash,csrfHash,JSON.stringify({user_agent_hash:bindingHash}),now,
      new Date(now.getTime()+86_400_000),new Date(now.getTime()+7*86_400_000)
    ]);
    const repository=new PostgresAuthenticationRiskSignalRepository(
      database.pool,auditContext,users,AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    );
    await expect(repository.recordForSession({
      tokenHash,bindingHash,kind:"LOGIN_SUCCESS",
      source:{ip:"198.51.100.7",userAgent:"alpha-session",requestId:randomUUID()}
    })).resolves.toBe("recorded");
    await expect(repository.recordForSession({
      tokenHash,bindingHash:`${bindingHash}-wrong`,kind:"SESSION_CONTEXT_CHANGED",
      source:{ip:"198.51.100.8",userAgent:"alpha-session",requestId:randomUUID()}
    })).resolves.toBe("scope_unresolved");
    const rows=await database.pool.query<{signal_kind:string;user_id:string}>(`
      SELECT signal_kind,user_id FROM identity.authentication_risk_signal
      WHERE user_id=$1
    `,[subject.userId]);
    expect(rows.rows).toEqual([{signal_kind:"LOGIN_SUCCESS",user_id:subject.userId}]);
  });

  it("rejects poisoned/cross-account envelopes and saturates before key load",async()=>{
    const alpha=await account(`poison-a-${randomUUID()}`);
    const beta=await account(`poison-b-${randomUUID()}`);
    const betaKey=await users.load(beta.userId);
    const wrong=encrypt(betaKey,Buffer.from(JSON.stringify({
      v:1,networkRef:`argon2id-audit:v1:${"1".repeat(64)}`,
      clientRef:`argon2id-audit:v1:${"3".repeat(64)}`
    })),authenticationRiskSignalAad(beta.userId));
    betaKey.fill(0);
    await expect(database.pool.query(
      "SELECT * FROM identity.record_authentication_risk_signal_for_recovery($1,$2,$3::jsonb)",
      [alpha.publicHandle,"RECOVERY_STARTED",JSON.stringify(wrong)]
    )).rejects.toMatchObject({code:"22023"});
    await expect(database.pool.query(`
      INSERT INTO identity.authentication_risk_signal(user_id,signal_kind,context_ciphertext,observed_at,expires_at)
      VALUES($1,'ACCOUNT_CONTENT_MATCH',$2::jsonb,clock_timestamp(),clock_timestamp()+interval '7776000 seconds')
    `,[alpha.userId,JSON.stringify({...wrong,debateText:"private"})])).rejects.toBeDefined();

    const alphaKey=await users.load(alpha.userId);
    const envelope=encrypt(alphaKey,Buffer.from(JSON.stringify({
      v:1,networkRef:`argon2id-audit:v1:${"1".repeat(64)}`,
      clientRef:`argon2id-audit:v1:${"3".repeat(64)}`
    })),authenticationRiskSignalAad(alpha.userId));
    alphaKey.fill(0);
    await database.pool.query(`
      INSERT INTO identity.authentication_risk_signal(
        user_id,signal_kind,context_ciphertext,observed_at,expires_at
      )
      SELECT $1,'LOGIN_SUCCESS',$2::jsonb,instant.observed_at,
        instant.observed_at+interval '7776000 seconds'
      FROM generate_series(1,129)
      CROSS JOIN LATERAL (SELECT clock_timestamp() AS observed_at) AS instant
    `,[alpha.userId,JSON.stringify(envelope)]);
    const before=loadedUsers.filter(id=>id===alpha.userId).length;
    const repository=new PostgresAuthenticationRiskSignalRepository(
      database.pool,auditContext,users,AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    );
    await expect(repository.evaluateForRecovery(alpha.publicHandle))
      .rejects.toThrow("AUTH_RISK_SIGNAL_SCAN_SATURATED");
    expect(loadedUsers.filter(id=>id===alpha.userId)).toHaveLength(before);
  });

  it("purges only expired rows in bounded batches and denies direct runtime DML",async()=>{
    const subject=await account(`retention-${randomUUID()}`);
    const key=await users.load(subject.userId);
    const envelope=encrypt(key,Buffer.from(JSON.stringify({
      v:1,networkRef:null,clientRef:null
    })),authenticationRiskSignalAad(subject.userId));
    key.fill(0);
    await database.pool.query(`
      INSERT INTO identity.authentication_risk_signal(
        user_id,signal_kind,context_ciphertext,observed_at,expires_at
      )
      SELECT $1,'LOGIN_SUCCESS',$2::jsonb,instant.observed_at,
        instant.observed_at+interval '7776000 seconds'
      FROM generate_series(1,1001)
      CROSS JOIN LATERAL (
        SELECT clock_timestamp()-interval '7776001 seconds' AS observed_at
      ) AS instant
    `,[subject.userId,JSON.stringify(envelope)]);
    await database.pool.query(`
      INSERT INTO identity.authentication_risk_signal(
        user_id,signal_kind,context_ciphertext,observed_at,expires_at
      )
      SELECT $1,'LOGIN_SUCCESS',$2::jsonb,instant.observed_at,
        instant.observed_at+interval '7776000 seconds'
      FROM (SELECT clock_timestamp() AS observed_at) AS instant
    `,[subject.userId,JSON.stringify(envelope)]);
    const repository=new PostgresAuthenticationRiskSignalRepository(
      database.pool,auditContext,users,AUTHENTICATION_RISK_SIGNAL_RETENTION_MS,
      MAX_AUTHENTICATION_RISK_SIGNAL_SCAN
    );
    await expect(repository.purgeExpired(1000)).resolves.toBe(1000);
    await expect(repository.purgeExpired(1000)).resolves.toBe(1);
    await expect(repository.purgeExpired(1000)).resolves.toBe(0);
    const retained=await database.pool.query<{signal_kind:string}>(`
      SELECT signal_kind FROM identity.authentication_risk_signal
      WHERE user_id=$1
    `,[subject.userId]);
    expect(retained.rows).toEqual([{signal_kind:"LOGIN_SUCCESS"}]);
    const privileges=await database.pool.query(`SELECT
      has_table_privilege('debateai_runtime','identity.authentication_risk_signal','SELECT') AS runtime_select,
      has_table_privilege('debateai_runtime','identity.authentication_risk_signal','INSERT') AS runtime_insert,
      has_function_privilege('debateai_runtime','identity.purge_expired_authentication_risk_signals(integer)','EXECUTE') AS runtime_purge`);
    expect(privileges.rows[0]).toEqual({runtime_select:false,runtime_insert:false,runtime_purge:true});
  });

  it("enforces risk capabilities through actual isolated login principals",async()=>{
    const suffix=randomBytes(6).toString("hex");
    const runtimeLogin=`p208_runtime_${suffix}`;
    const erasureLogin=`p208_erasure_${suffix}`;
    const runtimePassword=`p208-runtime-${suffix}`;
    const erasurePassword=`p208-erasure-${suffix}`;
    await database.pool.query(`CREATE ROLE ${runtimeLogin} LOGIN PASSWORD '${runtimePassword}' INHERIT`);
    await database.pool.query(`CREATE ROLE ${erasureLogin} LOGIN PASSWORD '${erasurePassword}' INHERIT`);
    await database.pool.query(`GRANT debateai_runtime TO ${runtimeLogin}`);
    await database.pool.query(`GRANT debateai_erasure_runtime TO ${erasureLogin}`);
    const runtimeUrl=new URL(database.connectionString);
    runtimeUrl.username=runtimeLogin;runtimeUrl.password=runtimePassword;
    const erasureUrl=new URL(database.connectionString);
    erasureUrl.username=erasureLogin;erasureUrl.password=erasurePassword;
    const runtime=createPool(runtimeUrl.toString());
    const erasure=createPool(erasureUrl.toString());
    try{
      await expect(runtime.query(
        "SELECT risk_signal_id FROM identity.authentication_risk_signal LIMIT 1"
      )).rejects.toMatchObject({code:"42501"});
      await expect(runtime.query(`
        INSERT INTO identity.authentication_risk_signal(
          user_id,signal_kind,context_ciphertext,observed_at,expires_at
        ) VALUES(gen_random_uuid(),'LOGIN_SUCCESS','{}'::jsonb,now(),now())
      `)).rejects.toMatchObject({code:"42501"});
      await expect(runtime.query(
        "SELECT identity.purge_expired_authentication_risk_signals(1) AS purged"
      )).resolves.toMatchObject({rows:[{purged:0}]});
      await expect(erasure.query(
        "SELECT risk_signal_id FROM identity.authentication_risk_signal LIMIT 1"
      )).rejects.toMatchObject({code:"42501"});
      await expect(erasure.query(
        "SELECT identity.purge_expired_authentication_risk_signals(1)"
      )).rejects.toMatchObject({code:"42501"});
    }finally{
      await Promise.all([runtime.end(),erasure.end()]);
    }
  });
});
