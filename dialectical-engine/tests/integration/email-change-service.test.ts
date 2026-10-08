import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresEmailChangeRepository, type Pool } from "@debateai/db";
import {
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generateVerificationToken,
  hashToken,
  type AuditContextHasher,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import { EmailChangeError, EmailChangeService } from "../../apps/api/src/email-change.js";
import { MemoryEmailChangeMailSender } from "../../apps/api/src/mail-channel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// Turn 14 — the change-email service over the real repository: addresses are
// decrypted under the user DEK, bearers are minted here and reach the database
// only as purpose-bound hashes, and the mail port carries every link.

let database: TestDatabase;
let authorization: Pool;

const blindIndexKey = Buffer.alloc(32, 0x5a);
const source = Object.freeze({ ip: "192.0.2.41", userAgent: "T14 Service", requestId: "request:t14s" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "33".repeat(32),
  hashUserAgent: async () => "44".repeat(32)
}) as unknown as AuditContextHasher;

const userKeys = new Map<string, Buffer>();
const users: ReadableUserDekStore = Object.freeze({
  async store(userId: string, dek: Uint8Array) { userKeys.set(userId, Buffer.from(dek)); },
  async load(userId: string) {
    const key = userKeys.get(userId);
    if (key === undefined) throw new Error("USER_DEK_UNRESOLVED");
    return Buffer.from(key);
  },
  async exists(userId: string) { return userKeys.has(userId); },
  async destroy(userId: string) { return userKeys.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT"; }
});

type Account = Readonly<{ userId: string; sessionId: string; email: string }>;

function addressAad(userId: string, field: "user.email_ciphertext" | "user.recovery_email_ciphertext") {
  return ["identity", field, userId, "run:none", userId, `user-dek:${userId}`, "1"] as const;
}

async function fixtureAccount(email: string, recoveryEmail: string | null = `recovery.${email}`): Promise<Account> {
  const userId = randomUUID();
  const dek = generateDek();
  await users.store(userId, dek);
  const emailCiphertext = encrypt(dek, Buffer.from(email, "utf8"), addressAad(userId, "user.email_ciphertext"));
  const recoveryCiphertext = recoveryEmail === null ? null : encrypt(dek, Buffer.from(recoveryEmail, "utf8"),
    addressAad(userId, "user.recovery_email_ciphertext"));
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,'$argon2id$fixture',$5,$6,$7,'active',now(),now())
  `, [userId, createEmailBlindIndex(blindIndexKey, email), JSON.stringify(emailCiphertext),
    recoveryCiphertext === null ? null : JSON.stringify(recoveryCiphertext), `t14s-${userId.slice(0, 12)}`, randomUUID(), randomUUID()]);
  await database.pool.query(`
    INSERT INTO identity.channel_binding (user_id,channel_type,address_ciphertext,state,created_at,verified_at)
    VALUES ($1,'email',$2::jsonb,'verified',now(),now())
  `, [userId, JSON.stringify(emailCiphertext)]);
  if (recoveryCiphertext !== null) await database.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'recovery_email',$2::jsonb,'verified',now(),now())`, [userId, JSON.stringify(recoveryCiphertext)]);
  const sessionId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 day',now()+interval '7 days',now(),NULL)
  `, [sessionId, userId, `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`,
    `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`]);
  return Object.freeze({ userId, sessionId, email });
}

async function grantFor(account: Account): Promise<string> {
  const token = generateVerificationToken();
  await database.pool.query(`
    INSERT INTO identity.step_up_grant (
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
    ) VALUES ($1,$2,$3,$4,'CHANGE_EMAIL',NULL,$4,now(),now()+interval '2 minutes')
  `, [randomUUID(), hashToken("step-up-grant", token), account.sessionId, account.userId]);
  return token;
}

function harness(overrides: Partial<{ resendCooldownMs: number }> = {}) {
  const mail = new MemoryEmailChangeMailSender();
  const service = new EmailChangeService({
    repository: new PostgresEmailChangeRepository(authorization, fakeAuditHasher),
    users,
    blindIndexKey,
    mail,
    tokenTtlMs: 24 * 3_600_000,
    resendCooldownMs: overrides.resendCooldownMs ?? 60_000
  });
  return { service, mail };
}

const session = (account: Account) => ({ userId: account.userId, sessionId: account.sessionId });

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(EmailChangeError);
  await expect(operation).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  const url = new URL(database.connectionString);
  url.searchParams.set("options", "-c role=debateai_authorization_runtime");
  authorization = createPool(url.toString());
}, 120_000);

afterAll(async () => { await authorization?.end(); await database?.stop(); });

describe("Turn 14 change-email service", () => {
  it("reads the current and recovery addresses with no change pending", async () => {
    const account = await fixtureAccount("ana.popescu@unibuc.ro", "a.popescu@proton.me");
    const { service } = harness();
    await expect(service.settings(session(account))).resolves.toEqual({
      email: "ana.popescu@unibuc.ro", recoveryEmail: "a.popescu@proton.me", pending: null
    });
  });

  it("reads Settings when recovery email is absent", async () => {
    expect((await authorization.query("SELECT current_user AS role")).rows[0].role).toBe("debateai_authorization_runtime");
    const account = await fixtureAccount(`no-recovery.${randomUUID()}@example.test`, null);
    const { service } = harness();
    await expect(service.settings(session(account))).resolves.toEqual({
      email: account.email, recoveryEmail: null, pending: null
    });
  });

  it("mails a confirmation link to the new address and a cancel link to the current one", async () => {
    const account = await fixtureAccount(`ana.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness();
    const before = Date.now();
    const pending = await service.request(session(account), {
      newEmail: "  Ana.Popescu@ICUB.ro ", grantToken: await grantFor(account)
    }, source);
    expect(pending.newEmail).toBe("ana.popescu@icub.ro");
    expect(pending.expiresAt.getTime() - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 1_000);
    expect(pending.expiresAt.getTime() - before).toBeLessThanOrEqual(24 * 3_600_000 + 5_000);
    expect(mail.messages).toEqual([
      { kind: "confirmation", recipient: "ana.popescu@icub.ro", token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
        expiresAt: pending.expiresAt },
      { kind: "notice", recipient: account.email, newEmail: "ana.popescu@icub.ro",
        cancelToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresAt: pending.expiresAt }
    ]);
    await expect(service.settings(session(account))).resolves.toEqual({
      email: account.email, recoveryEmail: `recovery.${account.email}`,
      pending: { newEmail: "ana.popescu@icub.ro", expiresAt: pending.expiresAt }
    });
  });

  it("confirms by the mailed link and the new address becomes the account's email", async () => {
    const account = await fixtureAccount(`bo.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness();
    const target = `bo.${randomUUID().slice(0, 8)}@icub.ro`;
    await service.request(session(account), { newEmail: target, grantToken: await grantFor(account) }, source);
    const confirmation = mail.messages.find((message) => message.kind === "confirmation");
    if (confirmation?.kind !== "confirmation") throw new Error("no confirmation mail");
    await expect(service.confirm(confirmation.token, source)).resolves.toBeUndefined();
    await expect(service.settings(session(account))).resolves.toMatchObject({ email: target, pending: null });
    const row = await database.pool.query<{ found: boolean }>(
      `SELECT email_blind_index=$1 AS found FROM identity."user" WHERE user_id=$2`,
      [createEmailBlindIndex(blindIndexKey, target), account.userId]
    );
    expect(row.rows[0]?.found).toBe(true);
    await expectCode(service.confirm(confirmation.token, source), "LINK_INVALID");
  });

  it("cancels by the link mailed to the current address", async () => {
    const account = await fixtureAccount(`cy.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness();
    await service.request(session(account), {
      newEmail: `cy.${randomUUID().slice(0, 8)}@icub.ro`, grantToken: await grantFor(account)
    }, source);
    const notice = mail.messages.find((message) => message.kind === "notice");
    const confirmation = mail.messages.find((message) => message.kind === "confirmation");
    if (notice?.kind !== "notice" || confirmation?.kind !== "confirmation") throw new Error("mail missing");
    await expect(service.cancelByLink(notice.cancelToken, source)).resolves.toBeUndefined();
    await expectCode(service.confirm(confirmation.token, source), "LINK_INVALID");
    await expect(service.settings(session(account))).resolves.toMatchObject({ email: account.email, pending: null });
    await expectCode(service.cancelByLink(notice.cancelToken, source), "LINK_INVALID");
  });

  it("never tells the requester an address is taken: the new address gets a note instead of a link", async () => {
    const owner = await fixtureAccount(`owner.${randomUUID().slice(0, 8)}@icub.ro`);
    const account = await fixtureAccount(`dee.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness();
    const pending = await service.request(session(account), {
      newEmail: owner.email, grantToken: await grantFor(account)
    }, source);
    expect(pending.newEmail).toBe(owner.email);
    expect(mail.messages.map((message) => [message.kind, message.recipient])).toEqual([
      ["address-unavailable", owner.email],
      ["notice", account.email]
    ]);
  });

  it("refuses a malformed address, the current address, and a missing or wrong grant", async () => {
    const account = await fixtureAccount(`eve.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness();
    const grant = await grantFor(account);
    await expectCode(service.request(session(account), { newEmail: "not-an-address", grantToken: grant }, source),
      "EMAIL_INVALID");
    await expectCode(service.request(session(account), { newEmail: "a@b.c,x@y.z", grantToken: grant }, source),
      "EMAIL_INVALID");
    await expectCode(service.request(session(account), { newEmail: account.email.toUpperCase(), grantToken: grant },
      source), "EMAIL_UNCHANGED");
    await expectCode(service.request(session(account), {
      newEmail: "eve@icub.ro", grantToken: generateVerificationToken()
    }, source), "STEP_UP_REQUIRED");
    expect(mail.messages).toEqual([]);
  });

  it("resends a fresh link after the cooldown and the earlier link stops working", async () => {
    const account = await fixtureAccount(`fay.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness({ resendCooldownMs: 1_000 });
    await service.request(session(account), {
      newEmail: `fay.${randomUUID().slice(0, 8)}@icub.ro`, grantToken: await grantFor(account)
    }, source);
    await expectCode(service.resend(session(account), source), "RESEND_COOLDOWN");
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await service.resend(session(account), source);
    const confirmations = mail.messages.filter((message) => message.kind === "confirmation");
    expect(confirmations).toHaveLength(2);
    const [first, second] = confirmations;
    if (first?.kind !== "confirmation" || second?.kind !== "confirmation") throw new Error("unreachable");
    expect(second.token).not.toBe(first.token);
    await expectCode(service.confirm(first.token, source), "LINK_INVALID");
    await expect(service.confirm(second.token, source)).resolves.toBeUndefined();
  });

  it("cancels the pending change from Settings and then has nothing to cancel or resend", async () => {
    const account = await fixtureAccount(`gil.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service } = harness();
    await service.request(session(account), {
      newEmail: `gil.${randomUUID().slice(0, 8)}@icub.ro`, grantToken: await grantFor(account)
    }, source);
    await expect(service.cancel(session(account), source)).resolves.toBeUndefined();
    await expect(service.settings(session(account))).resolves.toMatchObject({ pending: null });
    await expectCode(service.cancel(session(account), source), "NO_PENDING_CHANGE");
    await expectCode(service.resend(session(account), source), "NO_PENDING_CHANGE");
  });

  it("reports an expired link as expired and a garbage link as invalid", async () => {
    const account = await fixtureAccount(`hal.${randomUUID().slice(0, 8)}@unibuc.ro`);
    const { service, mail } = harness();
    await service.request(session(account), {
      newEmail: `hal.${randomUUID().slice(0, 8)}@icub.ro`, grantToken: await grantFor(account)
    }, source);
    await database.pool.query(`
      UPDATE identity.email_change_request SET issued_at=now()-interval '2 days',
        last_sent_at=now()-interval '2 days',expires_at=now()-interval '1 second' WHERE user_id=$1
    `, [account.userId]);
    const confirmation = mail.messages.find((message) => message.kind === "confirmation");
    if (confirmation?.kind !== "confirmation") throw new Error("no confirmation mail");
    await expectCode(service.confirm(confirmation.token, source), "LINK_EXPIRED");
    await expectCode(service.confirm("short", source), "LINK_INVALID");
    await expectCode(service.cancelByLink("x".repeat(43) + "!", source), "LINK_INVALID");
  });
});
