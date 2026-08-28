import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database:TestDatabase;

function envelope(keyId:string){
  return Object.freeze({
    v:1,keyId,nonce:randomBytes(12).toString("base64"),
    ct:randomBytes(32).toString("base64"),tag:randomBytes(16).toString("base64")
  });
}

async function user(label:string){
  const userId=randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      password_hash,pseudonym,state,adult_affirmed_at,created_at
    ) VALUES($1,$2,'{}'::jsonb,'{}'::jsonb,'hash',$3,'active',now(),now())
  `,[userId,randomBytes(32),`passkey-${label}`]);
  return userId;
}

async function insertPasskey(userId:string,overrides:Readonly<Record<string,unknown>>={}){
  const factorId=randomUUID();
  const values={
    credentialId:randomBytes(32).toString("base64url"),
    publicKey:{format:"COSE_KEY_BASE64URL_V1",value:randomBytes(64).toString("base64url")},
    rpId:"localhost",origin:"https://localhost:3000",userVerificationRequired:true,
    backupEligible:true,backupState:false,signatureCounter:"0",
    label:envelope(`passkey-label:${factorId}:v1`),...overrides
  };
  await database.pool.query(`
    INSERT INTO identity.mfa_factor(
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,relying_party_id,credential_origin,
      user_verification_required,backup_eligible,backup_state,
      device_label_ciphertext,signature_counter
    ) VALUES(
      $1,$2,'passkey',NULL,$3,$4::jsonb,'active',now(),now(),$5,$6,$7,$8,$9,
      $10::jsonb,$11
    )
  `,[
    factorId,userId,values.credentialId,JSON.stringify(values.publicKey),values.rpId,
    values.origin,values.userVerificationRequired,values.backupEligible,
    values.backupState,JSON.stringify(values.label),values.signatureCounter
  ]);
  return {factorId,...values};
}

beforeAll(async()=>{database=await startTestDatabase();await migrate(database.pool);},120_000);
afterAll(async()=>database?.stop());

describe("P2-10 passkey credential storage on real PostgreSQL",()=>{
  it("stores only exact RP/origin-bound passkey fields without attestation identity",async()=>{
    const columns=await database.pool.query<{
      column_name:string;data_type:string;
    }>(`
      SELECT column_name,data_type FROM information_schema.columns
      WHERE table_schema='identity' AND table_name='mfa_factor'
        AND column_name IN(
          'relying_party_id','credential_origin','user_verification_required',
          'backup_eligible','backup_state','device_label_ciphertext','signature_counter'
        ) ORDER BY ordinal_position
    `);
    expect(columns.rows).toEqual([
      {column_name:"relying_party_id",data_type:"text"},
      {column_name:"credential_origin",data_type:"text"},
      {column_name:"user_verification_required",data_type:"boolean"},
      {column_name:"backup_eligible",data_type:"boolean"},
      {column_name:"backup_state",data_type:"boolean"},
      {column_name:"device_label_ciphertext",data_type:"jsonb"},
      {column_name:"signature_counter",data_type:"bigint"}
    ]);
    const allColumns=await database.pool.query<{column_name:string}>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='identity' AND table_name='mfa_factor'
    `);
    expect(allColumns.rows.map(row=>row.column_name).join(" "))
      .not.toMatch(/aaguid|attestation|vendor|biometric|face|fingerprint/i);

    const userId=await user(`shape-${randomUUID()}`);
    const passkey=await insertPasskey(userId);
    const stored=await database.pool.query<{
      relying_party_id:string;credential_origin:string;user_verification_required:boolean;
      backup_eligible:boolean;backup_state:boolean;signature_counter:string;
      public_key:Record<string,unknown>;device_label_ciphertext:Record<string,unknown>;
    }>(`
      SELECT relying_party_id,credential_origin,user_verification_required,
        backup_eligible,backup_state,signature_counter::text,public_key,
        device_label_ciphertext
      FROM identity.mfa_factor WHERE mfa_factor_id=$1
    `,[passkey.factorId]);
    expect(stored.rows[0]).toEqual({
      relying_party_id:"localhost",credential_origin:"https://localhost:3000",
      user_verification_required:true,backup_eligible:true,backup_state:false,
      signature_counter:"0",public_key:passkey.publicKey,
      device_label_ciphertext:passkey.label
    });
  });

  it("rejects origin/RP/public-key/label poison and only permits monotonic counter state",async()=>{
    const userId=await user(`poison-${randomUUID()}`);
    await expect(insertPasskey(userId,{origin:"http://localhost"})).rejects.toBeDefined();
    await expect(insertPasskey(userId,{origin:"http://localhost:3000"})).rejects.toBeDefined();
    await expect(insertPasskey(userId,{rpId:"localhost/path"})).rejects.toBeDefined();
    await expect(insertPasskey(userId,{
      publicKey:{format:"COSE_KEY_BASE64URL_V1",value:"abc",vendor:"forbidden"}
    })).rejects.toBeDefined();
    await expect(insertPasskey(userId,{label:{deviceName:"plaintext laptop"}}))
      .rejects.toBeDefined();
    await expect(insertPasskey(userId,{
      label:envelope(`passkey-label:${randomUUID()}:v1`)
    })).rejects.toBeDefined();
    await expect(insertPasskey(userId,{backupEligible:false,backupState:true}))
      .rejects.toBeDefined();
    await expect(insertPasskey(userId,{signatureCounter:"4294967296"}))
      .rejects.toBeDefined();
    const passkey=await insertPasskey(userId);
    await expect(database.pool.query(`
      UPDATE identity.mfa_factor SET signature_counter=1,backup_state=true
      WHERE mfa_factor_id=$1
    `,[passkey.factorId])).resolves.toBeDefined();
    await expect(database.pool.query(`
      UPDATE identity.mfa_factor SET signature_counter=0 WHERE mfa_factor_id=$1
    `,[passkey.factorId])).rejects.toMatchObject({code:"55000"});
    await expect(database.pool.query(`
      UPDATE identity.mfa_factor SET relying_party_id='example.test'
      WHERE mfa_factor_id=$1
    `,[passkey.factorId])).rejects.toMatchObject({code:"55000"});
  });

  it("replays safely and denies direct passkey DML to actual application principals",async()=>{
    const replayUserId=await user(`replay-${randomUUID()}`);
    await insertPasskey(replayUserId);
    const migration=await readFile(
      new URL("../../migrations/0047_passkey_credential_storage.sql",import.meta.url),"utf8"
    );
    await expect(database.pool.query(migration)).resolves.toBeDefined();
    await expect(database.pool.query(migration)).resolves.toBeDefined();

    const suffix=randomBytes(6).toString("hex");
    for(const [index,memberRole] of [
      "debateai_runtime","debateai_authorization_runtime","debateai_erasure_runtime"
    ].entries()){
      const login=`p210_${index}_${suffix}`;
      const password=`p210-${index}-${suffix}`;
      await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' INHERIT`);
      await database.pool.query(`GRANT ${memberRole} TO ${login}`);
      const url=new URL(database.connectionString);url.username=login;url.password=password;
      const principal=createPool(url.toString());
      try{
        const directRead=principal.query(
          "SELECT credential_id FROM identity.mfa_factor WHERE factor_type='passkey' LIMIT 1"
        );
        if(memberRole!=="debateai_erasure_runtime"){
          await expect(directRead).resolves.toMatchObject({rowCount:1});
        }else{
          await expect(directRead).rejects.toMatchObject({code:"42501"});
        }
        await expect(principal.query(`
          UPDATE identity.mfa_factor SET signature_counter=signature_counter+1
          WHERE factor_type='passkey'
        `)).rejects.toMatchObject({code:"42501"});
        await expect(principal.query(
          "DELETE FROM identity.mfa_factor WHERE factor_type='passkey'"
        )).rejects.toMatchObject({code:"42501"});
        await expect(principal.query("TRUNCATE identity.mfa_factor"))
          .rejects.toMatchObject({code:"42501"});
      }finally{await principal.end();}
    }
  });
});
