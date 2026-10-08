import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createPool, PostgresStaffRepository, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase, runtime: Pool;
let legacyIdentityAcl: unknown;
const aclRead = `SELECT c.relname,c.relacl::text AS table_acl, array_agg(jsonb_build_object('column',a.attname,'acl',a.attacl::text) ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 WHERE n.nspname='identity' AND c.relname IN('user','channel_binding') GROUP BY c.relname,c.relacl::text ORDER BY c.relname`;
const hash = (value: string) => "sha256:" + createHash("sha256").update(value).digest("hex");
import { STAFF_PRIVATE_SENTINELS as SENTINELS, seedStaffPrivateObject } from "../support/staffPrivateObjectFixture.js";
async function account() {
  const userId = randomUUID(), sessionId = randomUUID(), tokenHash = hash(randomUUID());
  await database.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,$3,$3,$4,$5,'active',now())`, [userId, createHash("sha256").update(userId).digest(), { secret: SENTINELS[3] }, SENTINELS[4], SENTINELS[1] + userId]);
  await database.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId,userId,tokenHash,hash("csrf" + sessionId)]);
  await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES($1,'email',$2,'verified',now(),now())`, [userId,{ secret: SENTINELS[3] }]);
  await database.pool.query(`INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at)
    VALUES($1,'totp','{}','active',now(),now())`,[userId]);
  const ownerRef = (await database.pool.query('SELECT owner_ref FROM identity."user" WHERE user_id=$1',[userId])).rows[0].owner_ref as string;
  return { userId, ordinarySessionId: sessionId, ordinaryTokenHash: tokenHash, ownerRef };
}
async function actor(capabilities: string[] = ["TEAM_READ", "AUDIT_READ"]) {
  const base = await account(), staffId = randomUUID(), privilegeSessionId = randomUUID();
  await database.pool.query(`INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)`,[staffId,base.userId,capabilities]);
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`,[privilegeSessionId,staffId,base.userId,base.ordinarySessionId,hash(privilegeSessionId),hash("staffcsrf" + privilegeSessionId)]);
  const context = (await runtime.query("SELECT staff.read_context($1,$2,$3) AS value",[base.userId,base.ordinarySessionId,hash(privilegeSessionId)])).rows[0].value;
  return { ...base, context, staffId };
}
beforeAll(async () => {
  database = await startTestDatabase();
  for (const file of (await readdir('migrations')).filter(file => file.endsWith('.sql') && file < '0090_').sort()) await database.pool.query(await readFile('migrations/' + file,'utf8'));
  legacyIdentityAcl = (await database.pool.query(aclRead)).rows;
  console.info('[TASK7 PRE0090 IDENTITY ACL]', JSON.stringify(legacyIdentityAcl));
  await database.pool.query(await readFile('migrations/0090_staff_http_projections.sql','utf8'));
  await database.pool.query("CREATE ROLE task7_runtime LOGIN PASSWORD 'task7-only' IN ROLE debateai_runtime");
  const url = new URL(database.connectionString); url.username = "task7_runtime"; url.password = "task7-only"; runtime = createPool(url.toString());
});
afterAll(async () => { await runtime?.end(); await database?.stop(); });

describe("staff object and identity privacy projections", () => {
  it("provides guarded self enrollment and no cross-account lookup", async () => {
    expect((await database.pool.query("SELECT to_regprocedure('staff.read_enrollment(uuid,uuid,text)') AS fn")).rows[0].fn).not.toBeNull();
    const own = await account(), other = await account(), repo = new PostgresStaffRepository(runtime);
    const result = await repo.readEnrollment(own);
    expect(result?.user_id).toBe(own.userId);
    expect(Object.keys(result!)).toEqual(["user_id", "readiness"]);
    expect(await repo.readEnrollment({ ...own, userId: other.userId })).toBeNull();
    expect(await repo.readEnrollment({ ...own, ordinaryTokenHash: hash("stale") })).toBeNull();
    for (const sentinel of SENTINELS) expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it("bounds fixed-order team/audit pages, hides identity/content and rechecks capability", async () => {
    expect((await database.pool.query("SELECT to_regprocedure('staff.read_team_page(jsonb,text,integer,timestamptz,uuid)') AS fn")).rows[0].fn).not.toBeNull();
    const one = await actor(), two = await actor(), repo = new PostgresStaffRepository(runtime);
    await seedStaffPrivateObject(database.pool,one);
    const page = await repo.readTeamPage({ context: one.context, ordinaryTokenHash: one.ordinaryTokenHash, limit: 1 });
    expect(page.members).toHaveLength(1); expect(page.next_cursor).not.toBeNull(); expect(page.order).toBe("CREATED_AT_ID_ASC");
    expect(Object.keys(page.members[0]!).sort()).toEqual(["capabilities","credential_count","delivery_state","grant_revision","last_privilege_at","pseudonym","staff_id","status"]);
    const next = await repo.readTeamPage({ context: one.context, ordinaryTokenHash: one.ordinaryTokenHash, limit: 1, cursor: page.next_cursor! });
    expect(next.members[0]?.staff_id).not.toBe(page.members[0]?.staff_id);
    expect([page.members[0]?.staff_id,next.members[0]?.staff_id].sort()).toEqual([one.staffId,two.staffId].sort());
    const audit = await repo.readAuditPage({ context: one.context, ordinaryTokenHash: one.ordinaryTokenHash, limit: 100 });
    expect(audit).toEqual({ events: [], next_cursor: null, order: "RECORDED_AT_ID_ASC" });
    for (const sentinel of SENTINELS) expect(JSON.stringify({page,next,audit})).not.toContain(sentinel);
    await expect(repo.readTeamPage({ context: one.context, ordinaryTokenHash: one.ordinaryTokenHash, limit: 101 })).rejects.toThrow();
    await database.pool.query("UPDATE staff.subject SET state='DISABLED',security_epoch=security_epoch+1 WHERE staff_id=$1",[one.staffId]);
    await expect(repo.readTeamPage({ context: one.context, ordinaryTokenHash: one.ordinaryTokenHash, limit: 1 })).rejects.toThrow();
  });

  it("adds no runtime identity grants and denies all protected staff table reads", async () => {
    const actual = (await database.pool.query(aclRead)).rows;
    for (let index = 0; index < actual.length; index++) {
      expect(actual[index].table_acl).toEqual((legacyIdentityAcl as {table_acl: unknown}[])[index]!.table_acl);
      const oldColumns = (legacyIdentityAcl as {columns: {column: string; acl: string | null}[]}[])[index]!.columns;
      for (const column of actual[index].columns as {column: string; acl: string | null}[]) {
        const old = oldColumns.find(c => c.column === column.column)!;
        if (column.column !== 'channel_binding_id' && column.column !== 'address_ciphertext') expect(column.acl).toEqual(old.acl);
        else expect((column.acl ?? '').replace(/[{}]/g,'').split(',').filter(entry => entry && !entry.startsWith('debateai_staff_security_owner=')).sort()).toEqual((old.acl ?? '').replace(/[{}]/g,'').split(',').filter(entry => entry && !entry.startsWith('debateai_staff_security_owner=')).sort());
      }
    }
    expect((await database.pool.query("SELECT to_regprocedure('staff.read_target_invitation_channel(uuid,uuid,uuid,uuid,uuid)') AS fn")).rows[0].fn).not.toBeNull();
    for (const relation of ['staff.subject','staff.audit_event','staff.invitation']) {
      expect((await runtime.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS allowed",[relation])).rows[0].allowed).toBe(false);
    }
    expect((await database.pool.query("SELECT has_column_privilege('debateai_staff_security_owner','identity.channel_binding','channel_binding_id','SELECT') AS allowed")).rows[0].allowed).toBe(true);
    expect((await database.pool.query("SELECT has_column_privilege('debateai_staff_security_owner','identity.channel_binding','address_ciphertext','SELECT') AS allowed")).rows[0].allowed).toBe(true);
  });
});

it('orders invitation proof reads after sorted subject locks and observes cancellation without deadlock', async () => {
  const issuer = await actor(['TEAM_READ','TEAM_INVITE','TEAM_GRANT','TEAM_DISABLE','AUDIT_READ','EMERGENCY_DISABLE']), target = await account();
  await database.pool.query('UPDATE staff.owner_designation SET active=false WHERE active');
  await database.pool.query('INSERT INTO staff.owner_designation(staff_id) VALUES($1)',[issuer.staffId]);
  const invitationId=randomUUID(),proofId=randomUUID(),credentialId='task7-proof-key-'+randomUUID(),factorId=randomUUID(),invitationHash=hash(randomUUID()),proofHandleHash=hash(randomUUID());
  await database.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
    VALUES($1,$2,'passkey',$3,'{"format":"COSE_KEY_BASE64URL_V1","value":"YQ"}','active',now(),now(),'admin.example.test','https://admin.example.test',true,false,false,$4,0)`,[factorId,target.userId,credentialId,{v:1,keyId:'passkey-label:'+factorId+':v1',nonce:'AAAAAAAAAAAAAAAA',tag:'AAAAAAAAAAAAAAAAAAAAAA==',ct:'YQ=='}]);
  await database.pool.query(`INSERT INTO staff.invitation(invitation_id,operation_id,target_user_id,issuer_staff_id,issuer_security_epoch,target_account_security_epoch,capabilities,token_hash)
    VALUES($1,$2,$3,$4,0,0,ARRAY['TEAM_READ'],$5)`,[invitationId,randomUUID(),target.userId,issuer.staffId,invitationHash]);
  await database.pool.query(`INSERT INTO staff.invitation_proof(proof_id,invitation_id,user_id,ordinary_session_id,issuer_security_epoch,target_account_security_epoch,invitation_revision,credential_id,verified_at,expires_at,handle_sha256)
    VALUES($1,$2,$3,$4,0,0,0,$5,statement_timestamp(),statement_timestamp()+interval '5 minutes',$6)`,[proofId,invitationId,target.userId,target.ordinarySessionId,credentialId,proofHandleHash]);
  const repo=new PostgresStaffRepository(runtime),context=await repo.readInvitationContext({targetUserId:target.userId,ordinarySessionId:target.ordinarySessionId,invitationTokenHash:invitationHash});
  expect(context).not.toBeNull();
  const read={context:context!,ordinaryTokenHash:target.ordinaryTokenHash,proofHandleHash};
  expect((await repo.readInvitationProof(read))?.proofId).toBe(proofId);
  expect(await repo.readInvitationProof({...read,ordinaryTokenHash:hash('stale')})).toBeNull();
  expect(await repo.readInvitationProof({...read,context:{...context!,expiresAt:new Date(context!.expiresAt.getTime()+1000)}})).toBeNull();
  const first=await database.pool.connect(),second=await runtime.connect();
  try {
    await first.query('BEGIN');await second.query('BEGIN');await first.query("SET LOCAL statement_timeout='2s'");await second.query("SET LOCAL statement_timeout='2s'");
    await first.query('SELECT identity.lock_security_subjects($1::uuid[])',[[issuer.userId,target.userId]]);
    const pid=(await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid as number;
    const pending=second.query('SELECT staff.read_invitation_proof($1::jsonb,$2,$3) AS value',[context,target.ordinaryTokenHash,proofHandleHash]);
    let waiting=false;
    for (let attempt=0;attempt<80;attempt++) {
      const state=(await database.pool.query('SELECT wait_event FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0]?.wait_event;
      if (state==='advisory') {waiting=true;break;} await new Promise(resolve=>setTimeout(resolve,5));
    }
    expect(waiting).toBe(true);
    // A reader waiting for the namespace must not retain a proof SHARE row lock.
    await first.query('UPDATE staff.invitation_proof SET consumed_at=clock_timestamp() WHERE proof_id=$1',[proofId]);
    await first.query('COMMIT');
    expect((await pending).rows[0].value).toBeNull();await second.query('COMMIT');
  } finally {await first.query('ROLLBACK');await second.query('ROLLBACK');first.release();second.release();}
  expect(await repo.readInvitationProof(read)).toBeNull();
});
