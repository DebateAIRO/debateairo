import { randomUUID } from "node:crypto";
import { createEmailBlindIndex, encrypt, generateDek, generateVerificationToken, hashToken, type AuditContextHasher, type ReadableUserDekStore } from "@debateai/crypto";
import type { Pool } from "@debateai/db";
export const profileBlindKey = Buffer.alloc(32, 0x5a);
export const profileAudit = {
  hashSourceIp: async () => "33".repeat(32), hashUserAgent: async () => "44".repeat(32)
} as unknown as AuditContextHasher;
export const profileSource = {
  ip: "192.0.2.41", userAgent: "profile-test", requestId: "profile-test"
};
export const profileKeys = new Map<string, Buffer>();
export const profileUsers: ReadableUserDekStore = {
  store: async (id, dek) => {
    profileKeys.set(id, Buffer.from(dek));
  },
  load: async (id) => {
    const k = profileKeys.get(id);
    if (!k)
      throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(k);
  },
  exists: async (id) => profileKeys.has(id), destroy: async (id) => profileKeys.delete(id) ? "DESTROYED" : "ALREADY_ABSENT"
};
export const profileAad = (id: string, field: string) => ["identity", field, id, "run:none", id, `user-dek:${id}`, "1"] as const;
export async function profileAccount(pool: Pool, phone: string | null = "+40722123456", recovery: string | null = null) {
  const userId = randomUUID(), sessionId = randomUUID(), ownerRef = randomUUID(), email = `${randomUUID()}@example.test`, token = generateVerificationToken();
  const dek = generateDek();
  await profileUsers.store(userId, dek);
  const seal = (value: string, field: string) => encrypt(dek, Buffer.from(value), profileAad(userId, field));
  const emailCipher = seal(email, "user.email_ciphertext"), recoveryCipher = recovery === null ? null : seal(recovery, "user.recovery_email_ciphertext");
  await pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at,phone_ciphertext,phone_source,phone_verification_status,phone_updated_at)
VALUES($1,$2,$3::jsonb,$4::jsonb,'$argon2id$fixture',$5,$6,$7,'active',now(),now(),$8::jsonb,$9,$10,$11)`, [userId, createEmailBlindIndex(profileBlindKey, email), JSON.stringify(emailCipher), recoveryCipher === null ? null : JSON.stringify(recoveryCipher), `profile-${userId}`, randomUUID(), ownerRef, phone === null ? null : JSON.stringify(seal(phone, "user.phone_ciphertext")), phone === null ? null : "manual", phone === null ? null : "unverified", phone === null ? null : new Date()]);
  await pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email',$2::jsonb,'verified',now(),now())`, [userId, JSON.stringify(emailCipher)]);
  if (recoveryCipher)
    await pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'recovery_email',$2::jsonb,'verified',now(),now())`, [userId, JSON.stringify(recoveryCipher)]);
  await pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at) VALUES($1,$2,$3,$4,'{}',now(),now(),now()+interval '1 day',now()+interval '30 days',now())`, [sessionId, userId, hashToken("session", token), hashToken("csrf", generateVerificationToken())]);
  dek.fill(0);
  return {
    userId, sessionId, ownerRef, email, tokenHash: hashToken("session", token)
  };
}
export async function profileGrant(pool: Pool, account: Awaited<ReturnType<typeof profileAccount>>, action: string, ageSeconds = 0, ttlSeconds = 300) {
  const token = generateVerificationToken();
  await pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,issued_at,expires_at) VALUES($1,$2,$3,$4,$5,$4,now()-make_interval(secs=>$6),now()+make_interval(secs=>$7))`, [randomUUID(), hashToken("step-up-grant", token), account.sessionId, account.userId, action, ageSeconds, ttlSeconds]);
  return token;
}
