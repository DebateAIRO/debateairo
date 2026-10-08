import { randomBytes, randomUUID } from 'node:crypto';
import { encrypt, decrypt, generateDek } from '@debateai/crypto';
import type { Pool } from '@debateai/db';
import { expect } from 'vitest';
export const STAFF_PRIVATE_SENTINELS = ['PRIVATE_PROMPT_TASK7','PRIVATE_TITLE_TASK7','PRIVATE_ANSWER_TASK7','secret-task7@example.test','PRIVATE_TOKEN_TASK7'] as const;
const SENTINELS = STAFF_PRIVATE_SENTINELS;
export async function seedStaffPrivateObject(pool: Pool, base: Readonly<{userId:string;ownerRef:string;ordinarySessionId:string}>) {
  const runId = randomUUID(), dek = generateDek(), secret = randomBytes(32);
  const aad = ['core','run.content_ciphertext',runId,runId,base.ownerRef,'task7-private-object:v1','1'] as const;
  const contents = {questionLine: SENTINELS[0],title: SENTINELS[1],answer: SENTINELS[2]};
  const envelope = encrypt(dek,Buffer.from(JSON.stringify(contents)),aad);
  const provision = (await pool.query('SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS value',[runId,base.userId,base.ownerRef,base.ordinarySessionId])).rows[0].value;
  const attestation = (await pool.query(`SELECT audit_crypto_internal.hmac(core.content_envelope_attestation_bytes($1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',$2::jsonb),$3,'sha256') AS value`,[runId,envelope,secret])).rows[0].value as Buffer;
  const document = {runId,questionLine:'⟦DEBATEAI:CIPHERTEXT:V1⟧',askerId:'owner:'+base.ownerRef,executionRef:provision,callerScope:'ASKER',asOf:new Date().toISOString(),askerRiskTier:'casual',riskTier:'casual',tierSource:'ASKER',tierProvenanceRef:'task7-synthetic',compositionBudgetTier:'low',depthParams:{depth:1},discoveredPanel:[{agentId:'task7-synthetic'}],strangerSampleRate:1,envelopeBasis:{source:'task7-synthetic'},registerVersion:1,batteryVersion:'task7-synthetic',askContract:{ciphertext:true,v:1},contentCiphertext:envelope,contentAttestation:attestation.toString('base64'),contentAttestationSecret:secret.toString('base64')};
  expect((await pool.query('SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS value',[document,base.userId,base.ownerRef,JSON.stringify([])])).rows[0].value).toBe(true);
  const stored = (await pool.query('SELECT content_ciphertext FROM core.run WHERE run_id=$1',[runId])).rows[0].content_ciphertext;
  expect(JSON.parse(decrypt(dek,stored,aad).toString())).toEqual(contents);
  secret.fill(0); dek.fill(0);
}
