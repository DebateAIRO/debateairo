import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Argon2WorkerPool, AuditContextHasher, createEmailBlindIndex, encrypt, hashPassword, hashToken, type ReadableUserDekStore } from "@debateai/crypto";
import { createPool, migrate, PostgresRecoveryPermitRepository } from "@debateai/db";
import { canonicalRegisterJson, registerVersionToSafeLegacyNumber, loadBootstrapRegister, persistBootstrapRegister, createPostgresRegisterPublicationPort,
  parseRegisterVersionText, AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows,
  PASSWORD_RESET_POLICY_REGISTER_ROW as resetFacet, BACKUP_EMAIL_POLICY_REGISTER_ROW as backupFacet, MFA_RECOVERY_POLICY_REGISTER_ROW as mfaFacet } from "@debateai/register";
import { PostgresMfaRecoveryRepository } from "../../packages/db/src/email-mfa-recovery.js";
import { EmailRecoveryNotificationWorker, renderEmailRecoveryMail, type EmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { RecoveryPermitService } from "../../apps/api/src/recovery-permit.js";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { seedInstalledAuth106 } from "../support/auth106.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { createPreviewRecoveryApiFixture } from "../support/previewRecoveryPrincipal.js";
import { apiTestPools, createSystemTwin, provisionRlsLogins } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * The person's side of the Owner's permit over HTTP, end to end on a real database: the API's own login, the real
 * service, the real mail worker (its sender collects the mails instead of sending them) and Argon2. The Owner's
 * decision is made through the internal door the staff door calls; the staff door itself, its proof and its limits are
 * recovery-permit-0188.test.ts's and recovery-permits-http.test.ts's. Time is the database's: a test moves a row's own
 * times back instead of waiting.
 */
let db: TestDatabase, argon: Argon2WorkerPool, audit: AuditContextHasher, pool: ReturnType<typeof createPool>;
let permits: PostgresRecoveryPermitRepository, service: RecoveryPermitService;
const auth = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS), blind = Buffer.alloc(32, 91), keys = new Map<string, Buffer>();
const origin = "https://app.example.test", PASSWORD = "the account's own password";
const messages: EmailRecoveryMail[] = [];
const users: ReadableUserDekStore = {
  async store(id, key) { keys.set(id, Buffer.from(key)); },
  async load(id) { const key = keys.get(id); if (!key) throw Error("NO_DEK"); return Buffer.from(key); },
  async exists(id) { return keys.has(id); },
  async destroy() { throw Error("Must preserve DEK"); }
};
const RECOVERY_SYSTEM_ROLES = ["debateai_billing_runtime", "debateai_password_reset_runtime", "debateai_backup_email_runtime", "debateai_mfa_recovery_runtime"] as const;

type Account = Readonly<{ id: string; email: string; backupEmail: string }>;
/** An active account with a password, a passkey, and a sign-in and a backup address both verified long ago. */
async function account(): Promise<Account> {
  const id = randomUUID(), email = `primary-${id}@example.test`, backupEmail = `backup-${id}@example.test`, key = Buffer.alloc(32, 55);
  keys.set(id, key);
  const sealed = (value: string, field: string) => encrypt(key, Buffer.from(value), ["identity", field, id, "run:none", id, `user-dek:${id}`, "1"]);
  const primary = sealed(email, "user.email_ciphertext"), secondary = sealed(backupEmail, "user.recovery_email_ciphertext");
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at,created_at)
    VALUES($1,$2,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp()-interval '200 days')`,
    [id, createEmailBlindIndex(blind, email), primary, secondary, await hashPassword(argon, PASSWORD, auth.password.argon2id), `permit-${id}`]);
  for (const [type, value] of [["email", primary], ["recovery_email", secondary]] as const)
    await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
      VALUES($1,$2,$3,'verified',clock_timestamp()-interval '60 days',clock_timestamp()-interval '60 days')`, [id, type, value]);
  await db.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)", [id, randomBytes(32).toString("base64url")]);
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('debateai.mail_locale','en',true)");
    await c.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin)
      VALUES($1,$2,'AQID',0,'singleDevice',false,'app.example.test',$3)`, [id, randomBytes(16).toString("base64url"), origin]);
    await c.query("COMMIT");
  } finally { c.release(); }
  return { id, email, backupEmail };
}
/** One pass of the mail worker; what it would have sent is collected in `messages`. */
async function receive(): Promise<void> {
  const worker = new EmailRecoveryNotificationWorker({ dispatch: async (prepare) => { await (await prepare())?.(); }, flow: "recovery_permit", repository: permits, users,
    authPolicy: auth, sender: { async send(mail) { messages.push(mail); } }, reportDiagnostic: () => {} });
  await worker.reconcile(100);
  await worker.close();
}
const mailsTo = (address: string, event: EmailRecoveryMail["event"]) => messages.filter((m) => m.recipient === address && m.event === event);
const permitOf = async (a: Account) => (await db.pool.query("SELECT permit_id,stage,close_reason,revision::int AS revision FROM identity.recovery_permit WHERE user_id=$1 ORDER BY started_at DESC LIMIT 1", [a.id])).rows[0];
/** The Owner's approval, through the internal door the staff door calls once it checked the Owner, the proof and the limit. */
async function approve(a: Account): Promise<void> {
  const row = await permitOf(a);
  await db.pool.query("SELECT identity.recovery_permit_decide_internal($1,$2,$3,'APPROVED')", [row.permit_id, a.id, row.revision]);
}
async function age(a: Account, hours: number): Promise<void> {
  const row = await permitOf(a);
  await db.pool.query(`UPDATE identity.recovery_permit SET requested_at=requested_at-$2*interval '1 hour',request_expires_at=request_expires_at-$2*interval '1 hour',
    approved_at=approved_at-$2*interval '1 hour',not_before=not_before-$2*interval '1 hour',finish_expires_at=finish_expires_at-$2*interval '1 hour' WHERE permit_id=$1`, [row.permit_id, hours]);
  await db.pool.query("UPDATE identity.recovery_permit_notice SET available_at=available_at-$2*interval '1 hour' WHERE permit_id=$1", [row.permit_id, hours]);
}
const api = () => buildApi({ application: {} as AskApplication, allowedOrigin: origin, recoveryPermit: service });
const headers = (agent: string, cookie?: string) => ({ origin, "user-agent": agent, ...(cookie === undefined ? {} : { cookie }) });
/** The mail as text, in English: a mail in another language may be transfer-encoded, which would hide its links from a plain search. */
const rendered = (mail: EmailRecoveryMail) => renderEmailRecoveryMail({ ...mail, mailLocale: "en" }, { from: "noreply@example.test", publicAppUrl: origin });

beforeAll(async () => {
  db = await startTestDatabase();
  await seedInstalledAuth106(db.pool);
  argon = new Argon2WorkerPool();
  await argon.ready();
  await migrate(db.pool);
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(db.pool, bootstrap);
  const receipt = await createPostgresRegisterPublicationPort(db.pool).publishGeneral({ publicationId: randomUUID(), baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)),
    rows: [...await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL),
      ...[resetFacet, backupFacet, mfaFacet].map((row) => ({ rowKey: row.rowKey, valueJsonText: canonicalRegisterJson(row.valueAst), sourceRef: row.sourceRef }))],
    sourceRef: "approved email MFA native General fixture", deployment: "local" });
  const urls = new Map<string, string>((await provisionRlsLogins(db)).credentials());
  urls.set("DATABASE_URL", await createPreviewRecoveryApiFixture(db.pool, urls.get("DATABASE_URL")!));
  ({ runtime: pool } = await apiTestPools(db, import.meta.url, { runtime: urls.get("DATABASE_URL")!, system: await createSystemTwin(db, "recovery_permit_journey_system", RECOVERY_SYSTEM_ROLES) }));
  audit = new AuditContextHasher(argon, Buffer.alloc(32, 65), auth.auditSourceIpKdf);
  const sources = new PostgresMfaRecoveryRepository(pool, audit, registerVersionToSafeLegacyNumber(receipt.registerVersion));
  await sources.assertRole();
  permits = new PostgresRecoveryPermitRepository(pool);
  service = new RecoveryPermitService({ repository: permits, sources, users, argon2: argon, authPolicy: auth, blindIndexKey: blind });
}, 180_000);
afterAll(async () => { if (db) await (await provisionRlsLogins(db)).end(); audit?.close(); await argon?.close(); await db?.stop(); for (const key of keys.values()) key.fill(0); });

it("the start answers an address with an account and one without in the same words, and only the first gets a mail", async () => {
  const a = await account(), http = api();
  try {
    const known = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/start", headers: headers("start known"), payload: { email: a.email } });
    const unknown = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/start", headers: headers("start unknown"), payload: { email: `nobody-${randomUUID()}@example.test` } });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(unknown.body).toBe(known.body);
    expect(known.headers["cache-control"]).toBe("no-store");
    const before = messages.length;
    await receive();
    expect(messages.slice(before).map((m) => [m.event, m.recipient])).toEqual([["PROOF", a.email]]);
    expect((await db.pool.query("SELECT count(*)::int AS n FROM identity.recovery_permit")).rows[0].n).toBeGreaterThan(0);
    expect((await permitOf(a)).stage).toBe("LINK_SENT");
  } finally { await http.close(); }
});

it("from the emailed link to the enrol-only step: the password, the Owner's approval, 72 hours, the finish link", async () => {
  const a = await account(), http = api(), ctx = headers("journey", "debateai.locale=ro");
  try {
    expect((await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/start", headers: ctx, payload: { email: a.email } })).statusCode).toBe(202);
    await receive();
    const proof = mailsTo(a.email, "PROOF").at(-1)!;
    // The mail is in the language the request carried, and its two links lead to the help page.
    expect(proof.mailLocale).toBe("ro");
    expect(rendered(proof)).toContain(`${origin}/recover/help#token=${proof.token}`);
    expect(rendered(proof)).toContain(`${origin}/recover/help#cancel=${proof.cancelToken}`);
    expect(mailsTo(a.backupEmail, "PROOF")).toEqual([]);

    // The link with a wrong password is refused as a wrong password and asks nothing of the Owner.
    const wrong = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: proof.token, password: "not the password" } });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toEqual({ error: "RECOVERY_PERMIT_PROOF_INVALID" });
    expect((await permitOf(a)).stage).toBe("LINK_SENT");
    // A link nobody was sent is answered like a dead one, whatever the password.
    const forged = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: randomBytes(32).toString("base64url"), password: PASSWORD } });
    expect(forged.statusCode).toBe(410);
    expect(forged.json()).toEqual({ error: "RECOVERY_PERMIT_INVALID" });

    const requested = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: proof.token, password: PASSWORD } });
    expect(requested.statusCode).toBe(200);
    expect(requested.json()).toEqual({ status: "requested" });
    expect((await permitOf(a)).stage).toBe("REQUESTED");
    // The link is used up.
    expect((await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: proof.token, password: PASSWORD } })).statusCode).toBe(410);
    // Until the Owner decides nobody is mailed anything more.
    const quiet = messages.length;
    await receive();
    expect(messages.length).toBe(quiet);

    await approve(a);
    await receive();
    const waiting = [mailsTo(a.email, "WAITING").at(-1)!, mailsTo(a.backupEmail, "WAITING").at(-1)!];
    for (const mail of waiting) {
      expect(mail.mailLocale).toBe("ro");
      expect(mail.cancelToken).toBe(proof.cancelToken);
      expect(rendered(mail)).toContain(`${origin}/recover/help#cancel=${mail.cancelToken}`);
      expect(mail.notBefore!.getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    }
    // The finish link is not sent before the 72 hours are over.
    expect(mailsTo(a.email, "FINISH")).toEqual([]);

    await age(a, 73);
    await receive();
    const finish = mailsTo(a.email, "FINISH").at(-1)!;
    expect(mailsTo(a.backupEmail, "FINISH")).toEqual([]);
    expect(rendered(finish)).toContain(`${origin}/recover/help#finish=${finish.finishToken}`);
    expect((await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/finish/status", headers: ctx, payload: { token: finish.finishToken } })).json()).toMatchObject({ status: "ready_to_finish" });

    const wrongFinish = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/finish", headers: ctx, payload: { token: finish.finishToken, password: "not the password" } });
    expect(wrongFinish.statusCode).toBe(401);
    expect(wrongFinish.json()).toEqual({ error: "RECOVERY_PERMIT_PROOF_INVALID" });
    expect((await db.pool.query("SELECT count(*)::int AS n FROM identity.consumer_recovery_gate WHERE user_id=$1", [a.id])).rows[0].n).toBe(0);

    const opened = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/finish", headers: ctx, payload: { token: finish.finishToken, password: PASSWORD } });
    expect(opened.statusCode).toBe(200);
    const body = opened.json() as { status: string; available_methods: string[]; totp_unavailable_reason: null; recovery_capability: string; expires_at: string };
    expect(body).toMatchObject({ status: "RECOVERY_ENROLL_ONLY", available_methods: ["passkey", "totp"], totp_unavailable_reason: null });
    expect(new Date(body.expires_at).getTime() - Date.now()).toBeLessThanOrEqual(300_000);
    // The capability is /recover's own: its reader takes it for this account, as it takes one a saved code opened.
    const prepared = (await db.pool.query("SELECT identity.prepare_recovery_enrollment($1) AS value", [hashToken("consumer-recovery-enroll", body.recovery_capability)])).rows[0].value;
    expect(prepared).toMatchObject({ userId: a.id });
    expect((await permitOf(a)).stage).toBe("OPENED");
  } finally { await http.close(); }
}, 120_000);

it("the finish link before the 72 hours says from when it works, and the finish itself is refused as too early", async () => {
  const a = await account(), http = api(), ctx = headers("too early");
  try {
    await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/start", headers: ctx, payload: { email: a.email } });
    await receive();
    const proof = mailsTo(a.email, "PROOF").at(-1)!;
    await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: proof.token, password: PASSWORD } });
    await approve(a);
    // The finish mail is not out yet; its link is read here from the mail the worker will send once the wait is over.
    await age(a, 73);
    await receive();
    const finish = mailsTo(a.email, "FINISH").at(-1)!;
    await age(a, -73);
    const status = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/finish/status", headers: ctx, payload: { token: finish.finishToken } });
    expect(status.json()).toMatchObject({ status: "waiting" });
    expect(new Date(status.json().not_before).getTime() - Date.now()).toBeGreaterThan(71 * 3_600_000);
    const early = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/finish", headers: ctx, payload: { token: finish.finishToken, password: PASSWORD } });
    expect(early.statusCode).toBe(409);
    expect(early.json()).toEqual({ error: "RECOVERY_PERMIT_TOO_EARLY" });
    expect((await permitOf(a)).stage).toBe("WAITING");
  } finally { await http.close(); }
}, 120_000);

it("the cancel link in a notice ends an approved permit at once, tells every address, and the finish link is dead", async () => {
  const a = await account(), http = api(), ctx = headers("cancel");
  try {
    await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/start", headers: ctx, payload: { email: a.email } });
    await receive();
    const proof = mailsTo(a.email, "PROOF").at(-1)!;
    await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: proof.token, password: PASSWORD } });
    await approve(a);
    await age(a, 73);
    await receive();
    const finish = mailsTo(a.email, "FINISH").at(-1)!, notice = mailsTo(a.backupEmail, "WAITING").at(-1)!;
    // The backup address holds the cancel link too: whoever reads either mailbox can stop it.
    const cancelled = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/cancel", headers: ctx, payload: { token: notice.cancelToken } });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toEqual({ status: "cancelled" });
    expect(await permitOf(a)).toMatchObject({ stage: "CANCELLED", close_reason: "CANCEL_LINK" });
    const after = await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/finish", headers: ctx, payload: { token: finish.finishToken, password: PASSWORD } });
    expect(after.statusCode).toBe(410);
    expect(after.json()).toEqual({ error: "RECOVERY_PERMIT_INVALID" });
    await receive();
    for (const address of [a.email, a.backupEmail]) {
      const mail = mailsTo(address, "CANCELLED").at(-1)!;
      expect(mail.token ?? mail.cancelToken ?? mail.finishToken).toBeUndefined();
      expect(rendered(mail)).not.toContain("/recover/help#");
    }
  } finally { await http.close(); }
}, 120_000);

it("a refusal is one short mail to the address that proved the mailbox, with no link and no reason", async () => {
  const a = await account(), http = api(), ctx = headers("refused");
  try {
    await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/start", headers: ctx, payload: { email: a.email } });
    await receive();
    const proof = mailsTo(a.email, "PROOF").at(-1)!;
    await http.inject({ method: "POST", url: "/v1/auth/recovery-permit/request", headers: ctx, payload: { token: proof.token, password: PASSWORD } });
    const row = await permitOf(a);
    await db.pool.query("SELECT identity.recovery_permit_decide_internal($1,$2,$3,'REFUSED')", [row.permit_id, a.id, row.revision]);
    await receive();
    expect(mailsTo(a.backupEmail, "REFUSED")).toEqual([]);
    const mail = mailsTo(a.email, "REFUSED").at(-1)!;
    expect(rendered(mail)).not.toContain("/recover/help#");
    expect(mail.token ?? mail.cancelToken ?? mail.finishToken).toBeUndefined();
  } finally { await http.close(); }
}, 120_000);
