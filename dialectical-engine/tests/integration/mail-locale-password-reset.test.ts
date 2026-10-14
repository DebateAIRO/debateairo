import { createPreviewRecoveryApiFixture } from "../support/previewRecoveryPrincipal.js";
import { canonicalRegisterJson, registerVersionToSafeLegacyNumber, PASSWORD_RESET_POLICY_REGISTER_ROW as resetFacet, BACKUP_EMAIL_POLICY_REGISTER_ROW as backupFacet, MFA_RECOVERY_POLICY_REGISTER_ROW as mfaFacet } from "@debateai/register";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Argon2WorkerPool, AuditContextHasher, createEmailBlindIndex, encrypt, generateTotpSecret, hashPassword, totpCodeAtStep, type ReadableUserDekStore } from "@debateai/crypto";
import { createPool, migrate } from "@debateai/db";
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, loadBootstrapRegister, persistBootstrapRegister, createPostgresRegisterPublicationPort, parseRegisterVersionText } from "@debateai/register";
import { PASSWORD_RESET_POLICY_REGISTER_ROW, passwordResetPolicyFromValue, readPasswordResetPolicy } from "../../packages/register/src/password-reset-policy.js";
import { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";
import { PasswordResetService, passwordResetNoticeAad } from "../../apps/api/src/password-reset.js";
import { PasswordResetNotificationWorker, type PasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// S01 C09 (R-11, R-13, R-21; D-88; SPEC-v4 Appendix B A-6b): every password-reset writer stores the language of the
// request that caused it. Positive oracles go through the application service with the request's AuthSourceContext.
// Rejection oracles are direct SQL with the setting unset: the BEFORE INSERT guard raises MAIL_LOCALE_MISSING.
let db: TestDatabase, root: string, argon: Argon2WorkerPool, audit: AuditContextHasher, apiPool: ReturnType<typeof createPool>, repo: PostgresPasswordResetRepository, service: PasswordResetService, registerNumber: number;
const auth = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS), mfa = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), policy = passwordResetPolicyFromValue(PASSWORD_RESET_POLICY_REGISTER_ROW.value, PASSWORD_RESET_POLICY_REGISTER_ROW.sourceRef);
const keys = new Map<string, Buffer>(), blind = Buffer.alloc(32, 41), messages: PasswordResetMail[] = [];
const users: ReadableUserDekStore = { async store(id, key) {
    keys.set(id, Buffer.from(key));
  }, async load(id) {
    const key = keys.get(id);
    if (!key)
      throw new Error("NO_DEK");
    return Buffer.from(key);
  }, async exists(id) {
    return keys.has(id);
  }, async destroy() {
    throw new Error("Must retain DEK");
  } };
type Fixture = Awaited<ReturnType<typeof fixture>>;
// Each case gets its own source address, so the per-source admission window never couples two cases.
const context = (n: number) => ({ ip: `203.0.113.${n}`, userAgent: "c09-mail-locale", requestId: `c09-${n}` });
async function fixture() {
  const id = randomUUID(), email = `primary-${id}@example.test`, backup = `backup-${id}@example.test`, factor = randomUUID(), key = Buffer.alloc(32, 51), secret = generateTotpSecret();
  keys.set(id, key);
  const aad = (field: string) => ["identity", field, id, "run:none", id, `user-dek:${id}`, "1"] as const;
  const address = encrypt(key, Buffer.from(email), aad("user.email_ciphertext")), secondary = encrypt(key, Buffer.from(backup), aad("user.recovery_email_ciphertext")), seed = encrypt(key, secret, ["identity", "mfa_factor.secret_ciphertext", factor, "run:none", id, `user-dek:${id}`, "1"]);
  const password = await hashPassword(argon, "old strong password", auth.password.argon2id);
  // The fixture writes an active TOTP factor: the consumer-method trigger (0100) queues METHOD_CHANGED rows through the
  // 0116 guard, so the writes run in one transaction that carries a mail language, as a request's writes would.
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('debateai.mail_locale', 'en', true)");
    await client.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,$3,$4,$5,$6,'active',clock_timestamp())`, [id, createEmailBlindIndex(blind, email), address, secondary, password, `c09-${id}`]);
    await client.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,'email',$2,'verified',clock_timestamp()),($1,'recovery_email',$3,'verified',clock_timestamp())`, [id, address, secondary]);
    await client.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`, [factor, id, seed]);
    await client.query("COMMIT");
  }
  catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  finally {
    client.release();
  }
  return { id, email, backup, factor, secret, seed, password, address, key };
}
async function receive() {
  const worker = new PasswordResetNotificationWorker({ dispatch: async prepare => { await (await prepare())?.(); }, repository: repo, users, sender: { async send(mail) {
        messages.push(mail);
      } }, authPolicy: auth, passwordResetPolicy: policy, reportDiagnostic: () => {
    } });
  try {
    await worker.reconcile(100);
  }
  finally {
    await worker.close();
  }
}
// The stored mail_locale of every notice of one event for one user (one row per channel for COMPLETED, CANCELLED, REFUSED).
async function storedLocales(event: "PROOF" | "COMPLETED" | "CANCELLED" | "REFUSED", userId: string) {
  return (await db.pool.query(`SELECT mail_locale FROM identity.password_reset_notice WHERE user_id=$1 AND event_kind=$2 ORDER BY created_at`, [userId, event])).rows.map(row => row.mail_locale as string);
}
async function proofFor(email: string) {
  await receive();
  return messages.find(m => m.event === "PROOF" && m.recipient === email)!;
}
async function totpStep() {
  return Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
}
// The arguments the service hands to identity.password_reset_start, built the same way (password-reset.ts start) so
// that only the setting differs from a real request. Every envelope uses the AAD the service uses.
async function directStartArgs(a: Fixture) {
  const channels = (await db.pool.query(`SELECT channel_binding_id,channel_type FROM identity.channel_binding WHERE user_id=$1 AND channel_type IN('email','recovery_email') ORDER BY channel_binding_id`, [a.id])).rows as { channel_binding_id: string; channel_type: string }[];
  const ids = channels.map(c => c.channel_binding_id);
  const token = randomBytes(32).toString("base64url"), cancelToken = randomBytes(32).toString("base64url");
  const notices = channels.map(channel => {
    const recipient = channel.channel_type === "email" ? a.email : a.backup;
    return { channelId: channel.channel_binding_id, envelope: encrypt(a.key, Buffer.from(JSON.stringify({ recipient })), passwordResetNoticeAad(a.id, channel.channel_binding_id)), ...(channel.channel_type === "email" ? { proofEnvelope: encrypt(a.key, Buffer.from(JSON.stringify({ recipient, token, cancelToken })), passwordResetNoticeAad(a.id, channel.channel_binding_id)) } : {}) };
  });
  const refs = encrypt(a.key, Buffer.from(JSON.stringify({ v: 1, channelBindingIds: ids })), ["identity", "account_recovery_request.channel_refs_ciphertext", a.id, "run:none", a.id, `user-dek:${a.id}`, "1"]);
  const source = { ipArgon2id: `argon2id-audit:v1:${randomBytes(32).toString("hex")}`, userAgentArgon2id: `argon2id-audit:v1:${randomBytes(32).toString("hex")}` };
  return [createEmailBlindIndex(blind, a.email), a.id, ids, JSON.stringify(refs), `sha256:${randomBytes(32).toString("hex")}`, `sha256:${randomBytes(32).toString("hex")}`, JSON.stringify(notices), JSON.stringify(source), registerNumber];
}
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  root = await mkdtemp(join(tmpdir(), "mail-locale-password-reset-"));
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(db.pool, bootstrap);
  expect(await readPasswordResetPolicy(db.pool, bootstrap.registerVersion)).toBeNull();
  const rows = [...await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL), ...[resetFacet, backupFacet, mfaFacet].map(row => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }))];
  const publication = await createPostgresRegisterPublicationPort(db.pool).publishGeneral({ publicationId: randomUUID(), baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)), rows, sourceRef: "mail-locale password-reset fixture", deployment: "local" });
  registerNumber = registerVersionToSafeLegacyNumber(publication.registerVersion);
  expect(await readPasswordResetPolicy(db.pool, registerNumber)).toMatchObject({ maximumElapsedMs: 1800000 });
  await provisionDevelopmentDatabasePrincipals({ adminPool: db.pool, adminDatabaseUrl: db.connectionString, credentialFilePath: join(root, "database-principals.env") });
  const credentials = new Map((await readFile(join(root, "database-principals.env"), "utf8")).split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
    const i = line.indexOf("=");
    return [line.slice(0, i), line.slice(i + 1)];
  }));
  apiPool = createPool(await createPreviewRecoveryApiFixture(db.pool, credentials.get("DATABASE_URL")!));
  argon = new Argon2WorkerPool();
  await argon.ready();
  audit = new AuditContextHasher(argon, Buffer.alloc(32, 61), auth.auditSourceIpKdf);
  repo = new PostgresPasswordResetRepository(apiPool, audit, registerNumber);
  await repo.assertRole();
  service = new PasswordResetService({ repository: repo, users, argon2: argon, authPolicy: auth, mfaPolicy: mfa, passwordResetPolicy: policy, blindIndexKey: blind, reportDiagnostic: () => {
    } });
}, 120000);
afterAll(async () => {
  await apiPool?.end();
  audit?.close();
  await argon?.close();
  await db?.stop();
  if (root)
    await rm(root, { recursive: true, force: true });
  for (const key of keys.values())
    key.fill(0);
});
describe("password-reset writers store the language of the request that caused them (S01 C09)", () => {
  it("C09.1 a start from a ro request stores ro in the PROOF row and the worker claims ro; a start with no value stores en", async () => {
    const ro = await fixture();
    await service.start({ email: ro.email }, { ...context(1), mailLocale: "ro" });
    const en = await fixture();
    await service.start({ email: en.email }, context(2));
    expect(await storedLocales("PROOF", ro.id)).toEqual(["ro"]);
    expect(await storedLocales("PROOF", en.id)).toEqual(["en"]);
    expect((await proofFor(ro.email)).mailLocale).toBe("ro");
    expect((await proofFor(en.email)).mailLocale).toBe("en");
    ro.secret.fill(0);
    en.secret.fill(0);
  });
  it("C09.1 with the setting unset, the PROOF writer raises MAIL_LOCALE_MISSING at the notice insert and writes no row", async () => {
    const a = await fixture();
    const args = await directStartArgs(a);
    await expect(apiPool.query("SELECT identity.password_reset_start($1,$2,$3,$4,$5,$6,$7,$8,$9) AS ok", args)).rejects.toMatchObject({ code: "23514", message: expect.stringContaining("MAIL_LOCALE_MISSING") });
    expect(await storedLocales("PROOF", a.id)).toEqual([]);
    expect((await db.pool.query(`SELECT count(*)::int AS n FROM identity.account_recovery_request r JOIN identity.password_reset_control c USING(recovery_request_id) WHERE c.user_id=$1`, [a.id])).rows[0].n).toBe(0);
    a.secret.fill(0);
  });
  it("C09.2 a complete from pl stores pl in the COMPLETED row", async () => {
    const a = await fixture(), src = { ...context(3), mailLocale: "pl" };
    await service.start({ email: a.email }, src);
    const proof = await proofFor(a.email);
    const ticket = await service.exchange({ token: proof.token! }, src);
    expect(await service.complete({ sessionToken: ticket.sessionToken, password: "new strong password", code: totpCodeAtStep(a.secret, await totpStep()) }, src)).toEqual({ status: "completed" });
    expect(await storedLocales("COMPLETED", a.id)).not.toHaveLength(0);
    expect(new Set(await storedLocales("COMPLETED", a.id))).toEqual(new Set(["pl"]));
    a.secret.fill(0);
  });
  it("C09.3 a cancel from ro and a cancel-session from ro store ro in the CANCELLED rows", async () => {
    const a = await fixture(), src = { ...context(4), mailLocale: "ro" };
    await service.start({ email: a.email }, src);
    const proof = await proofFor(a.email);
    expect(await service.cancel({ token: proof.cancelToken! }, src)).toEqual({ status: "cancelled" });
    expect(new Set(await storedLocales("CANCELLED", a.id))).toEqual(new Set(["ro"]));
    const b = await fixture(), srcB = { ...context(5), mailLocale: "ro" };
    await service.start({ email: b.email }, srcB);
    const proofB = await proofFor(b.email);
    const ticket = await service.exchange({ token: proofB.token! }, srcB);
    expect(await service.cancelSession({ sessionToken: ticket.sessionToken }, srcB)).toEqual({ status: "cancelled" });
    expect(new Set(await storedLocales("CANCELLED", b.id))).toEqual(new Set(["ro"]));
    a.secret.fill(0);
    b.secret.fill(0);
  });
  it("C09.4 password_reset_notice_event REFUSED stores the setting ro, and with the setting unset raises MAIL_LOCALE_MISSING", async () => {
    const a = await fixture();
    await service.start({ email: a.email }, context(6));
    const requestId = (await db.pool.query(`SELECT recovery_request_id FROM identity.password_reset_control WHERE user_id=$1`, [a.id])).rows[0].recovery_request_id as string;
    // The runtime role has no EXECUTE on this internal writer (SQL callers only), so the function is driven as its owner.
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('debateai.mail_locale', 'ro', true)");
      await client.query("SELECT identity.password_reset_notice_event($1,'REFUSED')", [requestId]);
      await client.query("COMMIT");
    }
    catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    finally {
      client.release();
    }
    expect(new Set(await storedLocales("REFUSED", a.id))).toEqual(new Set(["ro"]));
    const c = await fixture();
    await service.start({ email: c.email }, context(7));
    const requestC = (await db.pool.query(`SELECT recovery_request_id FROM identity.password_reset_control WHERE user_id=$1`, [c.id])).rows[0].recovery_request_id as string;
    await expect(db.pool.query("SELECT identity.password_reset_notice_event($1,'REFUSED')", [requestC])).rejects.toMatchObject({ message: expect.stringContaining("MAIL_LOCALE_MISSING") });
    expect(await storedLocales("REFUSED", c.id)).toEqual([]);
    a.secret.fill(0);
    c.secret.fill(0);
  });
  it("C09.4 five wrong codes from a ro request reach the REFUSED stage through complete, and that row stores ro", async () => {
    const a = await fixture(), src = { ...context(8), mailLocale: "ro" };
    await service.start({ email: a.email }, src);
    const proof = await proofFor(a.email);
    const ticket = await service.exchange({ token: proof.token! }, src);
    const wrong = String((Number(totpCodeAtStep(a.secret, await totpStep())) + 1) % 1000000).padStart(6, "0");
    for (let attempt = 1; attempt <= 5; attempt++)
      await expect(service.complete({ sessionToken: ticket.sessionToken, password: "new strong password", code: wrong }, src)).rejects.toThrow("PASSWORD_RESET_PROOF_INVALID");
    expect(new Set(await storedLocales("REFUSED", a.id))).toEqual(new Set(["ro"]));
    a.secret.fill(0);
  });
  it("C09.5 the worker hands the claimed mail language to the renderer input", async () => {
    const a = await fixture();
    await service.start({ email: a.email }, { ...context(9), mailLocale: "ro" });
    const proof = await proofFor(a.email);
    expect(proof.mailLocale).toBe("ro");
    a.secret.fill(0);
  });
});
