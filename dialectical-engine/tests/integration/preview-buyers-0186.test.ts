import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresPreviewBuyerRepository, type Pool } from "@debateai/db";
import { PREVIEW_TEAM_MAX_MEMBERS } from "@debateai/providers";
import { canonicalPreviewBuyerBinding } from "../../apps/api/src/staff/preview-buyers.js";
import { canonicalStaffActionBinding } from "../../apps/api/src/staff/routes.js";
import { canonicalTeamLimitActionBinding } from "../../apps/api/src/staff/team-limit.js";
import { withMailLocale } from "../../packages/db/src/mail-locale.js";
import { createBillingTestAccount, eraseBillingTestAccount, type BillingTestAccount } from "../support/billingAccountFixture.js";
import { internalFundingFixture } from "../support/internalFundingFixture.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { authorizeStaffAlertFixture } from "../support/staffAlertReadiness.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0186, the preview's approved buyers, on real Postgres through the logins' own grants: the API's request login (the
 * runtime and billing roles), a runner-shaped login (the runtime role alone) and the API's system login. A proof here is
 * stored the way the ceremony stores one; the ceremony itself admits the buyer binding below ("the key ceremony").
 */
let database: TestDatabase, api: Pool, runner: Pool, system: Pool, repository: PostgresPreviewBuyerRepository;
const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
type Actor = Readonly<{ userId: string; sessionId: string; staffId: string; privilegeId: string; context: Record<string, unknown> }>;
type Intent = "PREVIEW_BUYER_ADD" | "PREVIEW_BUYER_REMOVE";
let owner: Actor;
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const ACT = "SELECT staff.preview_buyer_act($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::jsonb) AS value";

async function contextOf(a: Omit<Actor, "context">): Promise<Record<string, unknown>> {
  return (await api.query("SELECT staff.read_context($1,$2,$3) AS context", [a.userId, a.sessionId, hash(a.privilegeId)])).rows[0].context;
}
/** A delegated staff member with every capability a delegate can hold, and a live elevated session. */
async function delegate(): Promise<Actor> {
  const userId = randomUUID(), sessionId = randomUUID(), staffId = randomUUID(), privilegeId = randomUUID();
  const q = database.pool;
  await q.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), userId]);
  await q.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at,last_accepted_step)
    VALUES($1,$2,'totp','{}','active',now(),now(),1)`, [randomUUID(), userId]);
  await q.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',now(),now())`, [userId]);
  await q.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
    VALUES($1,$2,$3,$4,'{}',now()+interval '1 hour',now()+interval '2 hours',now())`, [sessionId, userId, hash(sessionId), hash("csrf" + sessionId)]);
  await q.query("INSERT INTO staff.subject(staff_id,user_id,capabilities) VALUES($1,$2,$3)", [staffId, userId, ["TEAM_READ", "AUDIT_READ", "EMERGENCY_DISABLE", "PUBLICATION_REVIEW", "THREAT_REPORT"]]);
  await q.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,0,0,0,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, staffId, userId, sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId)]);
  const base = { userId, sessionId, staffId, privilegeId };
  return { ...base, context: await contextOf(base) };
}
/** After the partner pick the delegate's sessions are revoked, as any grant change does: this is their new elevation. */
async function elevated(a: Actor): Promise<Actor> {
  const privilegeId = randomUUID(), s = (await database.pool.query("SELECT security_epoch,grant_revision FROM staff.subject WHERE staff_id=$1", [a.staffId])).rows[0];
  await database.pool.query(`INSERT INTO staff.privilege_session(privilege_session_id,staff_id,user_id,ordinary_session_id,token_hash,csrf_token_hash,security_epoch,account_security_epoch,grant_revision,idle_expires_at,absolute_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,now()+interval '15 minutes',now()+interval '2 hours')`, [privilegeId, a.staffId, a.userId, a.sessionId, hash(privilegeId), hash("staff-csrf" + privilegeId), s.security_epoch, s.grant_revision]);
  const base = { userId: a.userId, sessionId: a.sessionId, staffId: a.staffId, privilegeId };
  return { ...base, context: await contextOf(base) };
}
/** A proof as the ceremony stores one; with an event, the team tools are open for its operation and the alert is built. */
async function storedProof(a: Actor, binding: Record<string, unknown>, event: string | null, ttl: "live" | "expired" = "live"): Promise<Readonly<{ proofId: string; alert: Record<string, unknown> | null }>> {
  const proofId = randomUUID(), c = a.context as { securityEpoch: number; grantRevision: number; accountSecurityEpoch: number };
  const times = ttl === "expired" ? "now()-interval '2 minutes',now()-interval '1 minute'" : "now(),now()+interval '5 minutes'";
  await database.pool.query(`INSERT INTO staff.action_proof(proof_id,staff_id,user_id,ordinary_session_id,privilege_session_id,security_epoch,account_security_epoch,grant_revision,binding,credential_id,verified_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'fixture-key',${times})`, [proofId, a.staffId, a.userId, a.sessionId, a.privilegeId, c.securityEpoch, c.accountSecurityEpoch, c.grantRevision, binding]);
  if (event === null) return { proofId, alert: null };
  await authorizeStaffAlertFixture(database.pool, binding.operationId as string);
  return { proofId, alert: { schema: "staff-alert-v1", event, operationId: binding.operationId, envelope: ENVELOPE } };
}
const revision = async (): Promise<number> => (await database.pool.query("SELECT COALESCE(max(revision),0)::int AS r FROM staff.preview_buyer_event")).rows[0].r;
const rows = async (userId: string) => (await database.pool.query("SELECT kind,alerted,revision::int AS revision FROM staff.preview_buyer_event WHERE user_id=$1 ORDER BY revision", [userId])).rows;
const listed = async (userId: string): Promise<boolean> => (await api.query("SELECT staff.preview_buyer_listed($1) AS v", [userId])).rows[0].v;
const command = (intent: Intent, target: string, expectedRevision: number, operationId: string) => ({ intent, targetId: target, expectedRevision, operationId });
const binding = (intent: Intent, target: string, expectedRevision: number, operationId: string = randomUUID()) =>
  canonicalPreviewBuyerBinding(intent, target, expectedRevision, operationId) as unknown as Record<string, unknown>;
const EVENT: Record<Intent, string> = { PREVIEW_BUYER_ADD: "PREVIEW_BUYER_ADDED", PREVIEW_BUYER_REMOVE: "PREVIEW_BUYER_REMOVED" };
/** One change through the door, on the API's request login: proven, at the list's current revision, alerted unless `locked`. */
async function change(actor: Actor, intent: Intent, target: string, options: Readonly<{ locked?: boolean }> = {}) {
  const at = await revision(), proven = binding(intent, target, at), proof = await storedProof(actor, proven, options.locked === true ? null : EVENT[intent]);
  return api.query(ACT, [actor.context, proof.proofId, proven, command(intent, target, at, proven.operationId as string), proof.alert]);
}
async function buyer(label: string): Promise<BillingTestAccount> { return createBillingTestAccount(database.pool, label); }
async function auditCount(operationId: string): Promise<number> {
  return (await database.pool.query("SELECT count(*)::int AS n FROM staff.audit_event WHERE operation_id=$1", [operationId])).rows[0].n;
}
const consumed = async (proofId: string) => (await database.pool.query("SELECT consumed_at FROM staff.action_proof WHERE proof_id=$1", [proofId])).rows[0].consumed_at as Date | null;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The API's request login holds the runtime and billing roles; the runner's holds the runtime role alone.
  await database.pool.query("CREATE ROLE preview_buyers_api LOGIN PASSWORD 'preview-buyers-api-fixture-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE preview_buyers_runner LOGIN PASSWORD 'preview-buyers-runner-fixture-only' IN ROLE debateai_runtime");
  const url = (user: string, password: string) => { const u = new URL(database.connectionString); u.username = user; u.password = password; return u.toString(); };
  api = createPool(url("preview_buyers_api", "preview-buyers-api-fixture-only"));
  runner = createPool(url("preview_buyers_runner", "preview-buyers-runner-fixture-only"));
  system = createPool(await createSystemTwin(database, "preview_buyers_system", ["debateai_runtime", "debateai_billing_runtime"]));
  repository = new PostgresPreviewBuyerRepository(api, system);
  owner = await internalFundingFixture(database.pool, api).fundedActor() as unknown as Actor;
}, 180_000);
afterAll(async () => { await Promise.all([api?.end(), runner?.end(), system?.end()]); await database?.stop(); });

describe("who may change the list", () => {
  it("the Owner adds and removes an account, and each change is one row at the next revision", async () => {
    const ana = await buyer("owner-adds");
    const before = await revision();
    expect(await listed(ana.userId)).toBe(false);
    await change(owner, "PREVIEW_BUYER_ADD", ana.userId);
    expect(await listed(ana.userId)).toBe(true);
    await change(owner, "PREVIEW_BUYER_REMOVE", ana.userId);
    expect(await listed(ana.userId)).toBe(false);
    expect(await rows(ana.userId)).toEqual([{ kind: "ADDED", alerted: true, revision: before + 1 }, { kind: "REMOVED", alerted: true, revision: before + 2 }]);
    // Added again later, the account is listed again: its latest row decides.
    await change(owner, "PREVIEW_BUYER_ADD", ana.userId);
    expect(await listed(ana.userId)).toBe(true);
  });
  it("a staff member who is not the Owner is refused, by the door and by the list's reader, and nothing is written", async () => {
    const d = await delegate(), ana = await buyer("delegate-refused"), before = await revision();
    await expect(change(d, "PREVIEW_BUYER_ADD", ana.userId)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(repository.readList(d.context as never, hash(d.sessionId))).rejects.toThrow();
    expect(await revision()).toBe(before);
    expect(await listed(ana.userId)).toBe(false);
  });
  it("the team limit's partner, who may set the team's limit, is refused too: TEAM_GRANT is the Owner's alone", async () => {
    const d = await delegate(), partnerBinding = canonicalTeamLimitActionBinding({ action: "TEAM_LIMIT_PARTNER_GRANT", target_staff_id: d.staffId,
      expected_revision: 0, operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" } }, "unused", null) as unknown as Record<string, unknown>;
    const stored = await storedProof(owner, partnerBinding, "TEAM_LIMIT_PARTNER_GRANTED");
    await api.query("SELECT staff.grant_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb)",
      [owner.context, stored.proofId, partnerBinding, d.staffId, partnerBinding.operationId, { code: "GRANT_CHANGE" }, stored.alert]);
    const partner = await elevated(d), ana = await buyer("partner-refused");
    expect((await system.query("SELECT staff.authorize_action($1::jsonb,'TEAM_LIMIT_SET') AS ok", [partner.context])).rows[0].ok).toBe(true);
    await expect(change(partner, "PREVIEW_BUYER_ADD", ana.userId)).rejects.toThrow("STAFF_AUTHORITY_INVALID");
    await expect(repository.readList(partner.context as never, hash(partner.sessionId))).rejects.toThrow();
    const holder = (await database.pool.query("SELECT staff_id FROM staff.team_limit_holder WHERE active")).rows[0];
    if (holder !== undefined) await database.pool.query("SELECT staff.end_team_limit_holder($1,'OWNER_REVOKED')", [holder.staff_id]);
  });
  it("the Owner reads the list: each listed account by the ref of its latest addition, with its revision", async () => {
    const list = await repository.readList(owner.context as never, hash(owner.sessionId));
    expect(list.revision).toBe(await revision());
    const latest = (await database.pool.query(`SELECT DISTINCT ON (user_id) event_id,user_id,kind FROM staff.preview_buyer_event ORDER BY user_id,revision DESC`)).rows
      .filter((row) => row.kind === "ADDED");
    expect(list.buyers.map((row) => [row.ref, row.userId]).sort()).toEqual(latest.map((row) => [row.event_id, row.user_id]).sort());
  });
});

describe("the proof", () => {
  it("no proof, an expired proof or a proof of another staff session: nothing changes (a session without a fresh key step-up)", async () => {
    const ana = await buyer("no-step-up"), at = await revision(), proven = binding("PREVIEW_BUYER_ADD", ana.userId, at);
    await authorizeStaffAlertFixture(database.pool, proven.operationId as string);
    const alert = { schema: "staff-alert-v1", event: "PREVIEW_BUYER_ADDED", operationId: proven.operationId, envelope: ENVELOPE };
    await expect(api.query(ACT, [owner.context, randomUUID(), proven, command("PREVIEW_BUYER_ADD", ana.userId, at, proven.operationId as string), alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    const expired = await storedProof(owner, proven, null, "expired");
    await expect(api.query(ACT, [owner.context, expired.proofId, proven, command("PREVIEW_BUYER_ADD", ana.userId, at, proven.operationId as string), alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect(await revision()).toBe(at);
    expect(await listed(ana.userId)).toBe(false);
  });
  it("is bound to the account, the revision, the operation and the change: a proof for anything else is refused and stays unused", async () => {
    const ana = await buyer("bound-a"), ben = await buyer("bound-b"), at = await revision();
    const proven = binding("PREVIEW_BUYER_ADD", ana.userId, at), stored = await storedProof(owner, proven, "PREVIEW_BUYER_ADDED");
    const op = proven.operationId as string;
    for (const [label, wrong] of [
      ["another account", command("PREVIEW_BUYER_ADD", ben.userId, at, op)],
      ["another operation", command("PREVIEW_BUYER_ADD", ana.userId, at, randomUUID())],
      ["another change", command("PREVIEW_BUYER_REMOVE", ana.userId, at, op)],
      ["another revision", command("PREVIEW_BUYER_ADD", ana.userId, at + 1, op)]
    ] as const) {
      await expect(api.query(ACT, [owner.context, stored.proofId, proven, wrong, stored.alert]), label).rejects.toThrow("STAFF_PROOF_INVALID");
    }
    // A binding whose digest names another account, under this account as its target, is refused too.
    const forged = { ...proven, bodySha256: (binding("PREVIEW_BUYER_ADD", ben.userId, at, op)).bodySha256 };
    await expect(api.query(ACT, [owner.context, stored.proofId, forged, command("PREVIEW_BUYER_ADD", ana.userId, at, op), stored.alert])).rejects.toThrow("STAFF_PROOF_INVALID");
    expect(await consumed(stored.proofId)).toBeNull();
    expect(await revision()).toBe(at);
  });
  it("a stale list revision is refused by name, and the proof stays unused", async () => {
    const ana = await buyer("stale-a"), ben = await buyer("stale-b"), at = await revision();
    const proven = binding("PREVIEW_BUYER_ADD", ana.userId, at), stored = await storedProof(owner, proven, "PREVIEW_BUYER_ADDED");
    await change(owner, "PREVIEW_BUYER_ADD", ben.userId);
    await expect(api.query(ACT, [owner.context, stored.proofId, proven, command("PREVIEW_BUYER_ADD", ana.userId, at, proven.operationId as string), stored.alert]))
      .rejects.toThrow("PREVIEW_BUYERS_STALE");
    expect(await consumed(stored.proofId)).toBeNull();
    expect(await listed(ana.userId)).toBe(false);
  });
  it("a replayed change returns its first receipt and adds no row; a different request under its operation conflicts; the used proof opens nothing else", async () => {
    const ana = await buyer("replay"), ben = await buyer("replay-b"), at = await revision();
    const proven = binding("PREVIEW_BUYER_ADD", ana.userId, at), stored = await storedProof(owner, proven, "PREVIEW_BUYER_ADDED");
    const cmd = command("PREVIEW_BUYER_ADD", ana.userId, at, proven.operationId as string);
    const first = (await api.query(ACT, [owner.context, stored.proofId, proven, cmd, stored.alert])).rows[0].value;
    const again = (await api.query(ACT, [owner.context, stored.proofId, proven, cmd, stored.alert])).rows[0].value;
    expect(again).toEqual(first);
    expect(await revision()).toBe(at + 1);
    expect(await auditCount(proven.operationId as string)).toBe(1);
    // The same operation for another account: another request under the same operation.
    const other = binding("PREVIEW_BUYER_ADD", ben.userId, at, proven.operationId as string), otherProof = await storedProof(owner, other, null);
    await expect(api.query(ACT, [owner.context, otherProof.proofId, other, command("PREVIEW_BUYER_ADD", ben.userId, at, proven.operationId as string), stored.alert]))
      .rejects.toThrow("STAFF_OPERATION_CONFLICT");
    // The used proof under a new operation at the new revision: consumed, so refused.
    const op = randomUUID(), next = binding("PREVIEW_BUYER_REMOVE", ana.userId, at + 1, op);
    await authorizeStaffAlertFixture(database.pool, op);
    await expect(api.query(ACT, [owner.context, stored.proofId, next, command("PREVIEW_BUYER_REMOVE", ana.userId, at + 1, op), { ...stored.alert, operationId: op, event: "PREVIEW_BUYER_REMOVED" }]))
      .rejects.toThrow("STAFF_PROOF_INVALID");
    expect(await listed(ana.userId)).toBe(true);
  });
  it("crosses no other door: a buyer proof opens neither 0085's grant nor 0142's partner, and their proofs do not open this door", async () => {
    const d = await delegate(), ana = await buyer("cross"), at = await revision();
    const buyerBinding = binding("PREVIEW_BUYER_ADD", ana.userId, at), buyerProof = await storedProof(owner, buyerBinding, "GRANT");
    const op = buyerBinding.operationId as string, grantRevision = (await database.pool.query("SELECT grant_revision::int r FROM staff.subject WHERE staff_id=$1", [d.staffId])).rows[0].r;
    // 0085's grant (the system login's since 0171), aimed at the account and at a real staff member.
    for (const target of [ana.userId, d.staffId]) {
      await expect(system.query('SELECT staff."grant"($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::text[],$6::uuid,$7::jsonb,$8::jsonb)',
        [owner.context, buyerProof.proofId, buyerBinding, target, ["TEAM_READ"], op, { code: "GRANT_CHANGE" }, buyerProof.alert]), target).rejects.toThrow();
    }
    // 0142's partner, the same two ways.
    for (const target of [ana.userId, d.staffId]) {
      await expect(api.query("SELECT staff.grant_team_limit_partner($1::jsonb,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::jsonb,$7::jsonb)",
        [owner.context, buyerProof.proofId, buyerBinding, target, op, { code: "GRANT_CHANGE" }, { ...buyerProof.alert, event: "TEAM_LIMIT_PARTNER_GRANTED" }]), target).rejects.toThrow();
    }
    expect(await consumed(buyerProof.proofId)).toBeNull();
    expect((await database.pool.query("SELECT capabilities FROM staff.subject WHERE staff_id=$1", [d.staffId])).rows[0].capabilities).not.toContain("TEAM_GRANT");
    // A grant's TEAM_GRANT proof and a partner's proof, at this door with the account as the target.
    const grantBinding = canonicalStaffActionBinding({ action: "TEAM_GRANT", target_staff_id: d.staffId, capabilities: ["TEAM_READ"], expected_revision: grantRevision,
      operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" } }, {} as never) as unknown as Record<string, unknown>;
    const partnerBinding = canonicalTeamLimitActionBinding({ action: "TEAM_LIMIT_PARTNER_GRANT", target_staff_id: d.staffId, expected_revision: grantRevision,
      operation_id: randomUUID(), reason: { code: "GRANT_CHANGE" } }, "unused", null) as unknown as Record<string, unknown>;
    for (const foreign of [grantBinding, partnerBinding, { ...grantBinding, targetId: ana.userId, expectedRevision: at }]) {
      const stored = await storedProof(owner, foreign, "PREVIEW_BUYER_ADDED");
      for (const target of [ana.userId, d.staffId]) {
        await expect(api.query(ACT, [owner.context, stored.proofId, foreign, command("PREVIEW_BUYER_ADD", target, at, foreign.operationId as string), stored.alert]))
          .rejects.toThrow(/STAFF_PROOF_INVALID|PREVIEW_BUYER_ACCOUNT_INVALID/u);
      }
      expect(await consumed(stored.proofId)).toBeNull();
    }
    expect(await listed(ana.userId)).toBe(false);
  });
  it("the key ceremony admits the buyer binding as it is, for the Owner only: its start and its read take it under TEAM_GRANT", async () => {
    const key = async (a: Actor) => {
      const id = randomUUID();
      await withMailLocale(database.pool, "en", (c) => c.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,credential_id,public_key,state,created_at,verified_at,relying_party_id,credential_origin,user_verification_required,backup_eligible,backup_state,device_label_ciphertext,signature_counter)
        VALUES($1,$2,'passkey',$3,$4,'active',now(),now(),'localhost','https://localhost',true,false,false,$5,0)`, [id, a.userId, `key_${id.replaceAll("-", "")}`, { format: "COSE_KEY_BASE64URL_V1", value: "AA" }, { v: 1, keyId: `passkey-label:${id}:v1`, nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" }]));
      await database.pool.query("INSERT INTO identity.staff_webauthn_metadata(mfa_factor_id,user_id,user_handle_sha256,transports) VALUES($1,$2,$3,ARRAY['usb'])", [id, a.userId, hash(id)]);
    };
    const begin = (a: Actor, handle: string, proven: Record<string, unknown>) => system.query(
      "SELECT staff.begin_owned_webauthn($1,$2,'ACTION',$3,$4,'localhost','https://localhost',NULL,NULL,$5::jsonb,$6::jsonb,'{}'::jsonb) AS value",
      [a.userId, a.sessionId, hash(randomUUID()), handle, a.context, proven]);
    const ana = await buyer("ceremony"), proven = binding("PREVIEW_BUYER_ADD", ana.userId, await revision()), handle = hash(randomUUID());
    await key(owner);
    expect((await begin(owner, handle, proven)).rows[0].value).toMatchObject({ challengeId: expect.any(String) });
    const read = await system.query("SELECT staff.read_owned_webauthn_challenge($1,$2,$3,'ACTION',$4::jsonb,$5::jsonb,'{}'::jsonb) AS value",
      [owner.userId, owner.sessionId, handle, owner.context, proven]);
    expect(read.rows[0].value).toMatchObject({ challengeId: expect.any(String) });
    const d = await delegate();
    await key(d);
    await expect(begin(d, hash(randomUUID()), binding("PREVIEW_BUYER_ADD", ana.userId, await revision()))).rejects.toThrow("STAFF_AUTHORITY_INVALID");
  });
});

describe("the account and the list", () => {
  it("an account that is not active, or no account at all, is refused by name, and the proof stays unused", async () => {
    const ana = await buyer("not-active");
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [ana.userId]);
    for (const target of [ana.userId, randomUUID()]) {
      const at = await revision(), proven = binding("PREVIEW_BUYER_ADD", target, at), stored = await storedProof(owner, proven, "PREVIEW_BUYER_ADDED");
      await expect(api.query(ACT, [owner.context, stored.proofId, proven, command("PREVIEW_BUYER_ADD", target, at, proven.operationId as string), stored.alert]))
        .rejects.toThrow("PREVIEW_BUYER_ACCOUNT_INVALID");
      expect(await consumed(stored.proofId)).toBeNull();
    }
  });
  it("a listed account that is suspended cannot buy, stays on the Owner's list, and can buy again once it is active", async () => {
    // A change of state sends the account a security notice, which is written in a mail language.
    const ana = await buyer("suspended-listed"), state = (value: string) =>
      withMailLocale(database.pool, "en", (c) => c.query(`UPDATE identity."user" SET state=$2 WHERE user_id=$1`, [ana.userId, value]));
    const onList = async () => (await repository.readList(owner.context as never, hash(owner.sessionId))).buyers.some((row) => row.userId === ana.userId);
    await change(owner, "PREVIEW_BUYER_ADD", ana.userId);
    expect(await repository.listed(ana.userId)).toBe(true);
    // Suspended: the pay button's yes or no says no, with no change to the list.
    const at = await revision();
    await state("suspended");
    expect(await repository.listed(ana.userId)).toBe(false);
    expect(await onList()).toBe(true);
    expect(await revision()).toBe(at);
    // Active again: it buys again, still on the list, with no new approval.
    await state("active");
    expect(await repository.listed(ana.userId)).toBe(true);
    // While suspended, the Owner can still take it off the list, and it stays off once active.
    await state("suspended");
    await change(owner, "PREVIEW_BUYER_REMOVE", ana.userId);
    expect(await onList()).toBe(false);
    await state("active");
    expect(await repository.listed(ana.userId)).toBe(false);
    expect((await rows(ana.userId)).map((row) => row.kind)).toEqual(["ADDED", "REMOVED"]);
  });
  it("an account already listed cannot be added again, and one not listed cannot be removed", async () => {
    const ana = await buyer("preconditions");
    await change(owner, "PREVIEW_BUYER_ADD", ana.userId);
    await expect(change(owner, "PREVIEW_BUYER_ADD", ana.userId)).rejects.toThrow("PREVIEW_BUYER_ALREADY");
    const ben = await buyer("preconditions-b");
    await expect(change(owner, "PREVIEW_BUYER_REMOVE", ben.userId)).rejects.toThrow("PREVIEW_BUYER_NOT_LISTED");
    await change(owner, "PREVIEW_BUYER_REMOVE", ana.userId);
    await expect(change(owner, "PREVIEW_BUYER_REMOVE", ana.userId)).rejects.toThrow("PREVIEW_BUYER_NOT_LISTED");
  });
  it(`at most ${PREVIEW_TEAM_MAX_MEMBERS} accounts are listed at once: the database refuses one more on its own`, async () => {
    const now = (await repository.readList(owner.context as never, hash(owner.sessionId))).buyers.length, added: string[] = [];
    for (let index = now; index < PREVIEW_TEAM_MAX_MEMBERS; index++) {
      const account = await buyer(`cap-${index}`);
      await change(owner, "PREVIEW_BUYER_ADD", account.userId);
      added.push(account.userId);
    }
    expect((await repository.readList(owner.context as never, hash(owner.sessionId))).buyers).toHaveLength(PREVIEW_TEAM_MAX_MEMBERS);
    const one = await buyer("cap-over"), at = await revision();
    await expect(change(owner, "PREVIEW_BUYER_ADD", one.userId)).rejects.toThrow("PREVIEW_BUYERS_FULL");
    expect(await revision()).toBe(at);
    // A removal makes room again.
    await change(owner, "PREVIEW_BUYER_REMOVE", added[0]!);
    await change(owner, "PREVIEW_BUYER_ADD", one.userId);
    for (const userId of [...added.slice(1), one.userId]) await change(owner, "PREVIEW_BUYER_REMOVE", userId);
  });
});

describe("the team tools", () => {
  it("an addition while they are locked is refused, without an alert and with one whose operation was never opened, and writes nothing", async () => {
    const ana = await buyer("locked-add"), at = await revision();
    const plain = binding("PREVIEW_BUYER_ADD", ana.userId, at), noAlert = await storedProof(owner, plain, null);
    await expect(api.query(ACT, [owner.context, noAlert.proofId, plain, command("PREVIEW_BUYER_ADD", ana.userId, at, plain.operationId as string), null]))
      .rejects.toMatchObject({ code: "P0001", message: "STAFF_ALERT_UNAVAILABLE" });
    const closed = await storedProof(owner, plain, null);
    const alert = { schema: "staff-alert-v1", event: "PREVIEW_BUYER_ADDED", operationId: plain.operationId, envelope: ENVELOPE };
    await expect(api.query(ACT, [owner.context, closed.proofId, plain, command("PREVIEW_BUYER_ADD", ana.userId, at, plain.operationId as string), alert]))
      .rejects.toThrow("STAFF_ALERT_UNAVAILABLE");
    expect(await revision()).toBe(at);
    expect(await consumed(noAlert.proofId)).toBeNull();
    expect(await auditCount(plain.operationId as string)).toBe(0);
  });
  it("a removal while they are locked goes on: its row says alerted false, and no audit row or alert is written", async () => {
    const ana = await buyer("locked-remove");
    await change(owner, "PREVIEW_BUYER_ADD", ana.userId);
    const at = await revision(), proven = binding("PREVIEW_BUYER_REMOVE", ana.userId, at), stored = await storedProof(owner, proven, null);
    await api.query(ACT, [owner.context, stored.proofId, proven, command("PREVIEW_BUYER_REMOVE", ana.userId, at, proven.operationId as string), null]);
    expect(await listed(ana.userId)).toBe(false);
    expect((await rows(ana.userId)).at(-1)).toEqual({ kind: "REMOVED", alerted: false, revision: at + 1 });
    expect(await auditCount(proven.operationId as string)).toBe(0);
  });
  it("an addition writes the audit row and the independent alert, naming no account", async () => {
    const ana = await buyer("alerted"), at = await revision(), proven = binding("PREVIEW_BUYER_ADD", ana.userId, at), stored = await storedProof(owner, proven, "PREVIEW_BUYER_ADDED");
    await api.query(ACT, [owner.context, stored.proofId, proven, command("PREVIEW_BUYER_ADD", ana.userId, at, proven.operationId as string), stored.alert]);
    const audit = (await database.pool.query("SELECT event_id,event_type,actor_staff_id,subject_staff_id,reason_code FROM staff.audit_event WHERE operation_id=$1", [proven.operationId])).rows;
    expect(audit).toEqual([{ event_id: expect.any(String), event_type: "PREVIEW_BUYER_ADDED", actor_staff_id: owner.staffId, subject_staff_id: owner.staffId, reason_code: "GRANT_CHANGE" }]);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM staff.alert_outbox WHERE event_id=$1", [audit[0].event_id])).rows[0].n).toBe(1);
    const all = JSON.stringify((await database.pool.query("SELECT to_jsonb(a) AS row FROM staff.audit_event a WHERE operation_id=$1", [proven.operationId])).rows);
    expect(all).not.toContain(ana.userId);
    await change(owner, "PREVIEW_BUYER_REMOVE", ana.userId);
  });
  it("the general audit page leaves the list's two events out; 0150's page, which the release before reads, shows them as no event", async () => {
    const d = await delegate();
    const page = async (sql: string) => ((await api.query(sql, [d.context, hash(d.sessionId)])).rows[0].value as { events: Array<{ event: unknown; event_id: string }> }).events;
    const listOperations = (await database.pool.query("SELECT event_id FROM staff.audit_event WHERE event_type IN('PREVIEW_BUYER_ADDED','PREVIEW_BUYER_REMOVED')")).rows.map((row) => row.event_id);
    expect(listOperations.length).toBeGreaterThan(0);
    const current = await page("SELECT staff.read_audit_page_v2($1::jsonb,$2,100,NULL,NULL) AS value");
    expect(current.every((event) => event.event !== null)).toBe(true);
    expect(current.map((event) => event.event_id).filter((id) => listOperations.includes(id))).toEqual([]);
    const older = await page("SELECT staff.read_audit_page($1::jsonb,$2,100,NULL,NULL) AS value");
    expect(older.some((event) => event.event === null)).toBe(true);
  });
});

describe("the records and the grants", () => {
  it("no login may read or write the table; the yes or no is the API's billing role's, never the runner's", async () => {
    for (const role of ["debateai_runtime", "debateai_billing_runtime", "debateai_rls_all_accounts", "debateai_staff_recovery", "preview_buyers_api", "preview_buyers_runner", "preview_buyers_system"]) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        expect((await database.pool.query("SELECT has_table_privilege($1,'staff.preview_buyer_event',$2) AS ok", [role, privilege])).rows[0].ok, `${role} ${privilege}`).toBe(false);
      }
    }
    await expect(api.query("SELECT * FROM staff.preview_buyer_event")).rejects.toMatchObject({ code: "42501" });
    await expect(system.query("SELECT * FROM staff.preview_buyer_event")).rejects.toMatchObject({ code: "42501" });
    const ana = await buyer("grants");
    expect(await repository.listed(ana.userId)).toBe(false);
    for (const sql of ["SELECT staff.preview_buyer_listed($1::uuid)", "SELECT staff.read_preview_buyers('{}'::jsonb,$1::text)"]) {
      await expect(runner.query(sql, [ana.userId]), sql).rejects.toMatchObject({ code: "42501" });
    }
    await expect(runner.query(ACT, [owner.context, randomUUID(), {}, {}, null])).rejects.toMatchObject({ code: "42501" });
    const functions = (await database.pool.query(`SELECT p.oid::regprocedure::text AS signature,
        has_function_privilege('debateai_billing_runtime',p.oid,'EXECUTE') AS billing,has_function_privilege('debateai_runtime',p.oid,'EXECUTE') AS runtime,
        has_function_privilege('debateai_rls_all_accounts',p.oid,'EXECUTE') AS marker
      FROM pg_proc p WHERE p.oid IN('staff.preview_buyer_listed(uuid)'::regprocedure,'staff.read_preview_buyers(jsonb,text)'::regprocedure,
        'staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb)'::regprocedure,'staff.preview_buyer_body(jsonb)'::regprocedure) ORDER BY 1`)).rows;
    expect(functions).toEqual([
      { signature: "staff.preview_buyer_act(jsonb,uuid,jsonb,jsonb,jsonb)", billing: true, runtime: false, marker: false },
      { signature: "staff.preview_buyer_body(jsonb)", billing: false, runtime: false, marker: false },
      { signature: "staff.preview_buyer_listed(uuid)", billing: true, runtime: false, marker: false },
      { signature: "staff.read_preview_buyers(jsonb,text)", billing: true, runtime: false, marker: false }
    ]);
  });
  it("a row cannot be edited or the table emptied, not even by the database's administrator", async () => {
    for (const sql of ["UPDATE staff.preview_buyer_event SET kind='ADDED'", "TRUNCATE staff.preview_buyer_event"]) {
      await expect(database.pool.query(sql), sql).rejects.toThrow("STAFF_RECORD_IMMUTABLE");
    }
  });
  it("the account's erasure takes its rows with it; the audit row stays and names no account", async () => {
    const ana = await buyer("erased");
    const at = await revision(), proven = binding("PREVIEW_BUYER_ADD", ana.userId, at), stored = await storedProof(owner, proven, "PREVIEW_BUYER_ADDED");
    await api.query(ACT, [owner.context, stored.proofId, proven, command("PREVIEW_BUYER_ADD", ana.userId, at, proven.operationId as string), stored.alert]);
    expect(await listed(ana.userId)).toBe(true);
    expect(await eraseBillingTestAccount(database.pool, ana)).toBeTruthy();
    expect((await database.pool.query(`SELECT count(*)::int AS n FROM identity."user" WHERE user_id=$1`, [ana.userId])).rows[0].n).toBe(0);
    expect(await rows(ana.userId)).toEqual([]);
    expect(await listed(ana.userId)).toBe(false);
    expect(await auditCount(proven.operationId as string)).toBe(1);
  });
  it("the system login finds an account by its address's blind index, and the request login cannot", async () => {
    const ana = await buyer("find");
    const index = (await database.pool.query(`SELECT email_blind_index FROM identity."user" WHERE user_id=$1`, [ana.userId])).rows[0].email_blind_index as Buffer;
    expect(await repository.findAccount(index)).toEqual({ userId: ana.userId, active: true });
    expect(await repository.findAccount(Buffer.alloc(32, 7))).toBeNull();
    // Outside any request the request login sees no account's row (0130's row rule).
    expect((await new PostgresPreviewBuyerRepository(api, api).findAccount(index))).toBeNull();
  });
  it("the event list only widened: every event 0150 allowed is still allowed, beside the two of this list", async () => {
    const definition = (await database.pool.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='staff.audit_event'::regclass AND conname='audit_event_funded_event_type_check'`)).rows[0].d as string;
    for (const event of ["INVITE", "ACCEPT", "GRANT", "DISABLE", "BOOTSTRAP", "RECOVER_OWNER", "KEY_CHANGE", "ALLOWANCE_CONFIGURED", "ALLOWANCE_REVOKED",
      "TEAM_LIMIT_CHANGED", "TEAM_LIMIT_PARTNER_GRANTED", "TEAM_LIMIT_PARTNER_REVOKED", "TEAM_PRACTICE_RECORDED", "PUBLIC_REVIEW_CHANGED", "PREVIEW_BUYER_ADDED", "PREVIEW_BUYER_REMOVED"]) {
      expect(definition, event).toContain(`'${event}'::text`);
    }
  });
});
