import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { canonicalPreviewBuyerBinding } from "../../apps/api/src/staff/preview-buyers.js";
import { authorizeStaffAlertFixture } from "./staffAlertReadiness.js";

/**
 * The Owner of a test database, changing the preview's list of approved buyers (0186) through its one door
 * (staff.preview_buyer_act), with a proof stored the way the key ceremony stores one and, for an addition, the team tools
 * open for that one operation. Made on first use; the database's administrator pool seeds and calls.
 */
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
type Owner = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; context: Record<string, unknown> }>;

export function previewBuyerOwner(pool: Pool) {
  let made: Promise<Owner> | undefined;
  async function make(): Promise<Owner> {
    const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID();
    await pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `owner-${userId}`]);
    await pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
      VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
    await pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
    await pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash("csrf" + sessionId)]);
    await pool.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId, ["TEAM_READ", "TEAM_INVITE", "TEAM_GRANT", "TEAM_DISABLE", "AUDIT_READ", "EMERGENCY_DISABLE"]]);
    await pool.query("UPDATE staff.owner_designation SET active=false WHERE active");
    await pool.query("INSERT INTO staff.owner_designation(staff_id) VALUES($1)", [staffId]);
    await pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
      VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, userId, sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId)]);
    const context = (await pool.query("SELECT staff.read_context($1,$2,$3) AS context", [userId, sessionId, hash(privilegeId)])).rows[0].context as Record<string, unknown>;
    return { userId, sessionId, staffId, privilegeId, context };
  }
  /** One change through the door at the list's current revision; an addition with its alert, a removal with or without (`locked`). */
  async function change(intent: "PREVIEW_BUYER_ADD" | "PREVIEW_BUYER_REMOVE", userId: string, options: Readonly<{ locked?: boolean }> = {}): Promise<void> {
    const owner = await (made ??= make());
    const at = (await pool.query("SELECT COALESCE(max(revision),0)::int AS r FROM staff.preview_buyer_event")).rows[0].r as number;
    const binding = canonicalPreviewBuyerBinding(intent, userId, at, randomUUID());
    const proofId = randomUUID(), c = owner.context as { securityEpoch: number; grantRevision: number; accountSecurityEpoch: number };
    await pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixture-key',now(),now()+interval '5 minutes')`,
    [proofId, owner.staffId, owner.userId, owner.sessionId, owner.privilegeId, c.securityEpoch, c.accountSecurityEpoch, c.grantRevision, binding]);
    let alert: Record<string, unknown> | null = null;
    if (options.locked !== true) {
      await authorizeStaffAlertFixture(pool, binding.operationId);
      alert = { schema: "staff-alert-v1", event: intent === "PREVIEW_BUYER_ADD" ? "PREVIEW_BUYER_ADDED" : "PREVIEW_BUYER_REMOVED", operationId: binding.operationId, envelope: ENVELOPE };
    }
    await pool.query("SELECT staff.preview_buyer_act($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb)",
      [owner.context, proofId, binding, { intent, targetId: userId, expectedRevision: at, operationId: binding.operationId }, alert]);
  }
  return { change };
}
