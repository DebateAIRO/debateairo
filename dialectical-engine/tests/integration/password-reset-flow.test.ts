import { createPreviewRecoveryApiFixture } from "../support/previewRecoveryPrincipal.js";
import { canonicalRegisterJson, registerVersionToSafeLegacyNumber, PASSWORD_RESET_POLICY_REGISTER_ROW as resetFacet, BACKUP_EMAIL_POLICY_REGISTER_ROW as backupFacet, MFA_RECOVERY_POLICY_REGISTER_ROW as mfaFacet } from "@debateai/register";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Argon2WorkerPool, AuditContextHasher, createEmailBlindIndex, encrypt, generateTotpSecret, hashPassword, hashRecoveryCode, generateRecoveryCodes, totpCodeAtStep, verifyPassword, type ReadableUserDekStore } from "@debateai/crypto";
import { migrate, createPool, PostgresAuthenticationRiskSignalRepository, PostgresSessionRepository } from "@debateai/db";
import { AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue, RECOVERY_POLICY_REGISTER_ROW, recoveryPolicyFromRegisterRows, SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue, loadBootstrapRegister, persistBootstrapRegister, createPostgresRegisterPublicationPort, parseRegisterVersionText } from "@debateai/register";
import { PASSWORD_RESET_POLICY_REGISTER_ROW, passwordResetPolicyFromValue, readPasswordResetPolicy } from "../../packages/register/src/password-reset-policy.js";
import { PostgresPasswordResetRepository } from "../../packages/db/src/password-reset.js";
import { PasswordResetService } from "../../apps/api/src/password-reset.js";
import { PasswordResetNotificationWorker, type PasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
import { SessionService } from "../../apps/api/src/sessions.js";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { apiTestPools, createSystemTwin, provisionRlsLogins } from "../support/rls-logins.js";
let db: TestDatabase, argon: Argon2WorkerPool, audit: AuditContextHasher, apiPool: ReturnType<typeof createPool>, authPool: ReturnType<typeof createPool>, repo: PostgresPasswordResetRepository, service: PasswordResetService;
let credentialUrls: Map<string, string>;
const auth = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS), mfa = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), recovery = recoveryPolicyFromRegisterRows([RECOVERY_POLICY_REGISTER_ROW]), policy = passwordResetPolicyFromValue(PASSWORD_RESET_POLICY_REGISTER_ROW.value, PASSWORD_RESET_POLICY_REGISTER_ROW.sourceRef);
const keys = new Map<string, Buffer>(), blind = Buffer.alloc(32, 41), messages: PasswordResetMail[] = [], source = { ip: "203.0.113.77", userAgent: "genuine-password-reset-test", requestId: "fixture" }, origin = "https://preview.example.test";
// NV-40: the sweep cases start on their own network (TEST-NET-2), so their starts never spend the shared `source` window
// (password_reset_admit keys on the IP digest alone, 20 uses per 5 minutes, 0104:223-234).
const sweepSource = { ...source, ip: "198.51.100.40", userAgent: "password-reset-sweep-test" };
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
async function fixture(withCodes = true) {
  const id = randomUUID(), email = `primary-${id}@example.test`, backup = `backup-${id}@example.test`, factor = randomUUID(), key = Buffer.alloc(32, 51), secret = generateTotpSecret();
  keys.set(id, key);
  const aad = (field: string) => ["identity", field, id, "run:none", id, `user-dek:${id}`, "1"] as const;
  const address = encrypt(key, Buffer.from(email), aad("user.email_ciphertext")), secondary = encrypt(key, Buffer.from(backup), aad("user.recovery_email_ciphertext")), seed = encrypt(key, secret, ["identity", "mfa_factor.secret_ciphertext", factor, "run:none", id, `user-dek:${id}`, "1"]);
  const password = await hashPassword(argon, "old strong password", auth.password.argon2id);
  await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,$3,$4,$5,$6,'active',clock_timestamp())`, [id, createEmailBlindIndex(blind, email), address, secondary, password, `reset-${id}`]);
  await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,'email',$2,'verified',clock_timestamp()),($1,'recovery_email',$3,'verified',clock_timestamp())`, [id, address, secondary]);
  await db.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) SELECT $1::uuid,$2::uuid,'totp',$3::jsonb,'active',clock_timestamp() FROM (SELECT set_config('debateai.mail_locale','en',true)) AS carrier`, [factor, id, seed]);
  if (withCodes)
    await db.pool.query(`INSERT INTO identity.recovery_code(user_id,code_hash,code_slot) VALUES($1,$2,1)`, [id, await hashRecoveryCode(argon, generateRecoveryCodes()[0]!, mfa.recoveryCodes.argon2id)]);
  return { id, email, backup, factor, secret, seed, password, address };
}
async function receive() {
  const worker = new PasswordResetNotificationWorker({dispatch:async prepare=>{await (await prepare())?.();}, repository: repo, users, sender: { async send(mail) {
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
// NV-40: dead-letters whatever an earlier case left pending (superuser pool; the notice table has no UPDATE trigger).
const retirePending = () => db.pool.query("UPDATE identity.password_reset_notice SET dead_at=clock_timestamp() WHERE sent_at IS NULL AND dead_at IS NULL");
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(db.pool, bootstrap);
  expect(await readPasswordResetPolicy(db.pool, bootstrap.registerVersion)).toBeNull();
  const rows = [...await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL),...[resetFacet,backupFacet,mfaFacet].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
  const publication = await createPostgresRegisterPublicationPort(db.pool).publishGeneral({ publicationId: randomUUID(), baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)), rows, sourceRef: "password-only reset native General fixture", deployment: "local" });
  expect(await readPasswordResetPolicy(db.pool, registerVersionToSafeLegacyNumber(publication.registerVersion))).toMatchObject({ maximumElapsedMs: 1800000 });
  // R21 (PLAN S5.3, D67): one dev provisioning run (provisionRlsLogins) serves every URL; the recovery fixture login is
  // the runtime pool and its system twin, holding the same four capability roles, the target its background statements
  // and role checks run on, in both modes.
  const credentials = new Map<string, string>((await provisionRlsLogins(db)).credentials());
  credentials.set("DATABASE_URL", await createPreviewRecoveryApiFixture(db.pool, credentials.get("DATABASE_URL")!));
  credentialUrls = credentials;
  ({ runtime: apiPool, authorization: authPool } = await apiTestPools(db, import.meta.url, {
    runtime: credentials.get("DATABASE_URL")!,
    system: await createSystemTwin(db, "password_reset_flow_recovery_system", ["debateai_billing_runtime", "debateai_password_reset_runtime", "debateai_backup_email_runtime", "debateai_mfa_recovery_runtime"])
  }));
  argon = new Argon2WorkerPool();
  await argon.ready();
  audit = new AuditContextHasher(argon, Buffer.alloc(32, 61), auth.auditSourceIpKdf);
  repo = new PostgresPasswordResetRepository(apiPool, audit, registerVersionToSafeLegacyNumber(publication.registerVersion));
  await repo.assertRole();
  service = new PasswordResetService({ repository: repo, users, argon2: argon, authPolicy: auth, mfaPolicy: mfa, passwordResetPolicy: policy, blindIndexKey: blind, reportDiagnostic: () => {
    } });
}, 120000);
afterAll(async () => {
  if (db)
    await (await provisionRlsLogins(db)).end();
  audit?.close();
  await argon?.close();
  await db?.stop();
  for (const key of keys.values())
    key.fill(0);
});
describe("genuine native-role password-only HTTP reset", () => {
  it("grants all reset capabilities only to the native API, without table or owner/private-content authority", async () => {
    const capabilities = (await db.pool.query(`SELECT oid,oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname=ANY($1) ORDER BY proname`, [["password_reset_prepare", "password_reset_start", "password_reset_exchange", "password_reset_read", "password_reset_complete", "password_reset_cancel", "password_reset_cancel_session", "password_reset_admit", "password_reset_failure", "expire_password_reset", "password_reset_claim_notice", "password_reset_finish_notice", "password_reset_claim_pending_notice", "password_reset_start_guarded", "password_reset_proof_reserve", "password_reset_proof_refused", "password_reset_complete_guarded", "password_reset_admit_evicting"]])).rows;
    const tableOid = (await db.pool.query(`SELECT 'identity.password_reset_control'::regclass::oid AS oid`)).rows[0].oid;
    expect(capabilities).toHaveLength(18);
    for (const environmentKey of ["DATABASE_URL", "AUTHORIZATION_DATABASE_URL", "LIVENESS_DATABASE_URL", "SUPPORT_DATABASE_URL", "ERASURE_DATABASE_URL"]) {
      const pool = createPool(credentialUrls.get(environmentKey)!);
      try {
        const grants = (await pool.query(`SELECT has_function_privilege(current_user,oid,'EXECUTE') AS allowed FROM unnest($1::oid[]) oid`, [capabilities.map(cap => cap.oid)])).rows;
        expect(grants.map(r => r.allowed)).toEqual(Array(18).fill(environmentKey === "DATABASE_URL"));
        expect((await pool.query(`SELECT has_table_privilege(current_user,$1::oid,'SELECT,INSERT,UPDATE,DELETE') AS table_access,pg_has_role(current_user,'debateai_password_reset_owner','USAGE') AS owner_access`, [tableOid])).rows[0]).toEqual({ table_access: false, owner_access: false });
        if (environmentKey === "DATABASE_URL")
          expect(await new PostgresPasswordResetRepository(pool, audit, 5).assertRole()).toBeUndefined();
        else
          await expect(pool.query(`SELECT identity.password_reset_read($1)`, ["sha256:" + "a".repeat(64)])).rejects.toThrow("permission denied");
      }
      finally {
        await pool.end();
      }
    }
    expect((await db.pool.query(`SELECT has_table_privilege('debateai_password_reset_owner','core.run','SELECT,INSERT,UPDATE,DELETE') AS content,has_table_privilege('debateai_password_reset_owner','identity.recovery_code','SELECT,INSERT,UPDATE,DELETE') AS saved_codes`)).rows[0]).toEqual({ content: false, saved_codes: false });
  });
  it("requires current TOTP, retains seed and codes, revokes old login/session, then signs in with the next code", async () => {
    const a = await fixture();
    const sessions = await SessionService.create({ repository: new PostgresSessionRepository(authPool, audit), riskSignals: new PostgresAuthenticationRiskSignalRepository(apiPool, audit, users, recovery.riskSignals.rawSignalRetentionMs, recovery.riskSignals.maximumEvaluatorSignals), onRiskSignalFailure: () => {
      }, dekStore: users, argon2: argon, authPolicy: auth, mfaPolicy: mfa, sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef), blindIndexKey: blind });
    const api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, passwordReset: service, sessions });
    try {
      const before = (await db.pool.query(`SELECT * FROM identity.recovery_code WHERE user_id=$1`, [a.id])).rows;
      const loginHeaders = { origin, "user-agent": "old ordinary login" };
      const login = await api.inject({ method: "POST", url: "/v1/auth/login", headers: loginHeaders, payload: { email: a.email, password: "old strong password" } });
      expect(login.statusCode).toBe(202);
      const step = Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
      const oldSession = await api.inject({ method: "POST", url: "/v1/auth/login", headers: loginHeaders, payload: { challenge_token: login.json().challenge_token, code: totpCodeAtStep(a.secret, step - 1) } });
      expect(oldSession.statusCode).toBe(200);
      const oldCookie = (oldSession.headers["set-cookie"] as string[]).map(c => c.split(";")[0]).join("; ");
      const staleChallenge = await api.inject({ method: "POST", url: "/v1/auth/login", headers: loginHeaders, payload: { email: a.email, password: "old strong password" } });
      expect(staleChallenge.statusCode).toBe(202);
      expect((await api.inject({ method: "POST", url: "/v1/auth/password-reset/start", headers: { origin }, payload: { email: a.email } })).statusCode).toBe(202);
      await receive();
      const proof = messages.find(m => m.event === "PROOF" && m.recipient === a.email)!;
      expect(proof.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(messages.some(m => m.event === "PROOF" && m.recipient === a.backup)).toBe(false);
      const exchange = await api.inject({ method: "POST", url: "/v1/auth/password-reset/exchange", headers: { origin }, payload: { token: proof.token } });
      expect(exchange.statusCode).toBe(200);
      expect(exchange.json()).toMatchObject({ status: "password_required", password_min_length: auth.password.minimumLength });
      expect(exchange.json().csrf_token).toBeUndefined();
      const scopedCookie = (exchange.headers["set-cookie"] as string[]).map(c => c.split(";")[0]).join("; "), csrf = /__Host-debateai-password-reset-csrf=([^;]+)/.exec(scopedCookie)![1];
      expect((exchange.headers["set-cookie"] as string[])[0]).toContain("HttpOnly; Secure; SameSite=Strict");
      expect((await api.inject({ method: "GET", url: "/v1/session", headers: { cookie: scopedCookie } })).statusCode).toBe(401);
      const resetHeaders = { origin, cookie: scopedCookie, "x-password-reset-csrf-token": csrf };
      expect((await api.inject({ method: "POST", url: "/v1/auth/password-reset/complete", headers: { origin, cookie: scopedCookie }, payload: { password: "new strong password", code: totpCodeAtStep(a.secret, step) } })).statusCode).toBe(403);
      const replay = await api.inject({ method: "POST", url: "/v1/auth/password-reset/complete", headers: resetHeaders, payload: { password: "new strong password", code: totpCodeAtStep(a.secret, step - 1) } });
      expect(replay.statusCode).toBe(401);
      const wrong = (Number(totpCodeAtStep(a.secret, step)) + 1) % 1000000;
      expect((await api.inject({ method: "POST", url: "/v1/auth/password-reset/complete", headers: resetHeaders, payload: { password: "new strong password", code: String(wrong).padStart(6, "0") } })).statusCode).toBe(401);
      const complete = await api.inject({ method: "POST", url: "/v1/auth/password-reset/complete", headers: resetHeaders, payload: { password: "new strong password", code: totpCodeAtStep(a.secret, step) } });
      expect(complete.statusCode).toBe(200);
      expect(complete.json()).toEqual({ status: "completed" });
      expect(complete.headers["set-cookie"]).toBeUndefined();
      expect((await api.inject({ method: "GET", url: "/v1/auth/password-reset/status", headers: { cookie: scopedCookie } })).json()).toMatchObject({ status: "completed", password_min_length: auth.password.minimumLength });
      const current = (await db.pool.query(`SELECT password_hash FROM identity."user" WHERE user_id=$1`, [a.id])).rows[0].password_hash;
      expect(await verifyPassword(argon, current, "new strong password")).toBe(true);
      expect(await verifyPassword(argon, current, "old strong password")).toBe(false);
      expect((await db.pool.query(`SELECT mfa_factor_id,secret_ciphertext,state FROM identity.mfa_factor WHERE user_id=$1`, [a.id])).rows).toEqual([{ mfa_factor_id: a.factor, secret_ciphertext: a.seed, state: "active" }]);
      expect((await db.pool.query(`SELECT * FROM identity.recovery_code WHERE user_id=$1`, [a.id])).rows).toEqual(before);
      expect((await api.inject({ method: "GET", url: "/v1/session", headers: { cookie: oldCookie, "user-agent": "old ordinary login" } })).statusCode).toBe(401);
      expect((await api.inject({ method: "POST", url: "/v1/auth/login", headers: loginHeaders, payload: { challenge_token: staleChallenge.json().challenge_token, code: totpCodeAtStep(a.secret, step + 1) } })).statusCode).toBe(401);
      expect((await api.inject({ method: "POST", url: "/v1/auth/login", headers: loginHeaders, payload: { email: a.email, password: "old strong password" } })).statusCode).toBe(401);
      const freshHeaders = { origin, "user-agent": "fresh ordinary login" };
      const challenge = await api.inject({ method: "POST", url: "/v1/auth/login", headers: freshHeaders, payload: { email: a.email, password: "new strong password" } });
      expect(challenge.statusCode).toBe(202);
      const fresh = await api.inject({ method: "POST", url: "/v1/auth/login", headers: freshHeaders, payload: { challenge_token: challenge.json().challenge_token, code: totpCodeAtStep(a.secret, step + 1) } });
      expect(fresh.statusCode).toBe(200);
      expect(fresh.json().session.caller_scope).toBe("ASKER");
      await receive();
      expect(messages.filter(m => m.event === "COMPLETED" && [a.email, a.backup].includes(m.recipient)).map(m => m.recipient).sort()).toEqual([a.email, a.backup].sort());
    }
    finally {
      a.secret.fill(0);
      await api.close();
    }
  });
  it("has the same public start result for absent/backup/staff addresses and creates no proof authority", async () => {
    const a = await fixture(false);
    await db.pool.query(`INSERT INTO staff.subject(user_id,state) VALUES($1,'DISABLED')`, [a.id]);
    const n = messages.length;
    for (const email of ["absent@example.test", a.backup, a.email])
      expect(await service.start({ email }, source)).toEqual({ message: "If this account can be recovered, instructions will arrive through an eligible channel." });
    await receive();
    expect(messages.length).toBe(n);
    a.secret.fill(0);
  });
  it("completes with the existing authenticator even when there are no unused saved codes", async () => {
    const a = await fixture(false);
    await service.start({ email: a.email }, source);
    await receive();
    const proof = messages.find(m => m.event === "PROOF" && m.recipient === a.email)!;
    const ticket = await service.exchange({ token: proof.token! }, source);
    const step = Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
    expect(await service.complete({ sessionToken: ticket.sessionToken, password: "new no-codes password", code: totpCodeAtStep(a.secret, step) }, source)).toEqual({ status: "completed" });
    expect((await db.pool.query(`SELECT count(*)::int AS n FROM identity.recovery_code WHERE user_id=$1`, [a.id])).rows[0].n).toBe(0);
    a.secret.fill(0);
  });
  it("allows the actual lawful erasure prepare/finalize routine to clean every reset record without affecting another account", async () => {
    const a = await fixture(), other = await fixture();
    await service.start({ email: a.email }, source);
    await receive();
    const proof = messages.find(m => m.event === "PROOF" && m.recipient === a.email)!;
    const ticket = await service.exchange({ token: proof.token! }, source);
    const erasure = randomUUID();
    await db.pool.query(`INSERT INTO identity.account_erasure_request(erasure_id,user_id,requested_at,execute_at) VALUES($1,$2,clock_timestamp(),clock_timestamp())`, [erasure, a.id]);
    await expect(service.complete({ sessionToken: ticket.sessionToken, password: "erasure must win password", code: totpCodeAtStep(a.secret, Math.floor(Date.now() / 30000)) }, source)).rejects.toThrow("PASSWORD_RESET_INVALID");
    const erasurePool = createPool(credentialUrls.get("ERASURE_DATABASE_URL")!);
    try {
      expect((await erasurePool.query(`SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome FROM (SELECT set_config('debateai.mail_locale','en',true)) AS carrier`, [erasure])).rows[0].outcome).toBe("PREPARED");
      const ack = await db.pool.query(`UPDATE identity.account_erasure_notification_outbox SET claim_token=gen_random_uuid(),claim_expires_at=NULL,acknowledged_at=clock_timestamp(),last_error_code=NULL WHERE user_id=$1 AND acknowledged_at IS NULL`, [a.id]);
      expect(ack.rowCount).toBeGreaterThan(0);
      expect((await erasurePool.query(`SELECT identity.finalize_account_erasure($1,clock_timestamp(),clock_timestamp(),0,0,1,0) AS outcome`, [erasure])).rows[0].outcome).toBe("COMMITTED");
      expect((await db.pool.query(`SELECT count(*)::int AS n FROM identity.password_reset_control WHERE user_id=$1`, [a.id])).rows[0].n).toBe(0);
      expect((await db.pool.query(`SELECT count(*)::int AS n FROM identity.password_reset_notice WHERE user_id=$1`, [a.id])).rows[0].n).toBe(0);
      expect((await db.pool.query(`SELECT password_hash FROM identity."user" WHERE user_id=$1`, [other.id])).rows[0].password_hash).toBe(other.password);
    }
    finally {
      await erasurePool.end();
      a.secret.fill(0);
      other.secret.fill(0);
    }
  });
  it("returns an explicit cancelled receipt after a lost cancellation response and releases only that reset binding", async () => {
    const a = await fixture();
    await service.start({ email: a.email }, source);
    await receive();
    const proof = messages.find(m => m.event === "PROOF" && m.recipient === a.email)!;
    const ticket = await service.exchange({ token: proof.token! }, source);
    await service.cancelSession({ sessionToken: ticket.sessionToken }, source);
    expect(await service.status({ sessionToken: ticket.sessionToken })).toMatchObject({ status: "cancelled" });
    expect((await db.pool.query(`SELECT identity.password_recovery_prepare($1) AS candidate`, [createEmailBlindIndex(blind, a.email)])).rows[0].candidate).toMatchObject({ userId: a.id });
    await expect(service.status({ sessionToken: "A".repeat(43) })).rejects.toThrow("PASSWORD_RESET_INVALID");
    a.secret.fill(0);
  });
  // NV-40: the guard runs first, so it never follows a failing red-first case; each case starts from an empty outbox.
  it("a PROOF out for delivery is not killed by the sweep (NV-40)", async () => {
    await receive();
    await retirePending();
    const u4 = await fixture();
    await service.start({ email: u4.email }, sweepSource);
    const held = await repo.claimNotice(60000);
    expect(held!.userId).toBe(u4.id);
    expect(held!.event).toBe("PROOF");
    await db.pool.query(`UPDATE identity.password_reset_control SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=$1`, [u4.id]);
    expect(await repo.claimNotice(1000)).toBeNull();
    expect((await db.pool.query(`SELECT dead_at FROM identity.password_reset_notice WHERE notice_id=$1`, [held!.noticeId])).rows[0].dead_at).toBeNull();
    expect(await repo.finishNotice(held!.noticeId, held!.leaseId, true, 300000, 3)).toBe(true);
    u4.secret.fill(0);
  });
  it("one run dead-letters every stale PROOF at the head and still delivers the next one (NV-40)", async () => {
    await receive();
    await retirePending();
    const u1 = await fixture(), u2 = await fixture(), u3 = await fixture();
    for (const u of [u1, u2, u3])
      await service.start({ email: u.email }, sweepSource);
    await db.pool.query(`UPDATE identity.password_reset_control SET expires_at=clock_timestamp()-interval '1 second' WHERE user_id=ANY($1)`, [[u1.id, u2.id]]);
    const n = messages.length;
    await receive();
    const proofs = async (id: string) => (await db.pool.query(`SELECT dead_at,sent_at FROM identity.password_reset_notice WHERE user_id=$1 AND event_kind='PROOF'`, [id])).rows;
    for (const u of [u1, u2]) {
      const rows = await proofs(u.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].dead_at).not.toBeNull();
      expect(rows[0].sent_at).toBeNull();
    }
    const delivered = await proofs(u3.id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].sent_at).not.toBeNull();
    expect(messages.slice(n).map(m => ({ event: m.event, recipient: m.recipient }))).toEqual([{ event: "PROOF", recipient: u3.email }]);
    for (const u of [u1, u2, u3])
      u.secret.fill(0);
  });
  it("matches at most five codes per account round across concurrent requests, then refuses a new start until the lock lapses (NV-17)", async () => {
    // One TEST-NET-1 address per request: an IPv4 source keeps its own full-address window (password_reset_admit, 20
    // per 5 minutes), so the per-source admit is never the limiter here and the shared `source` window is not spent.
    const a = await fixture(false), net = (n: number) => ({ ...source, ip: `192.0.2.${n}`, userAgent: "password-reset-cap-test" });
    const proofs = async () => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.password_reset_notice WHERE user_id=$1 AND event_kind='PROOF'`, [a.id])).rows[0].n;
    await service.start({ email: a.email }, net(100));
    await receive();
    const proof = messages.find(m => m.event === "PROOF" && m.recipient === a.email)!;
    const ticket = await service.exchange({ token: proof.token! }, net(100));
    const step = Number((await db.pool.query(`SELECT floor(extract(epoch FROM clock_timestamp())/30)::bigint AS step`)).rows[0].step);
    const valid = new Set([-2, -1, 0, 1, 2].map(d => totpCodeAtStep(a.secret, step + d))), wrong: string[] = [];
    for (let code = 100000; wrong.length < 12; code++)
      if (!valid.has(String(code)))
        wrong.push(String(code));
    const outcomes = await Promise.all(wrong.map((code, n) => service.complete({ sessionToken: ticket.sessionToken, password: "capped new password", code }, net(n + 1)).then(() => "COMPLETED", (error: Error) => error.message)));
    expect(outcomes.filter(o => o === "PASSWORD_RESET_PROOF_INVALID")).toHaveLength(5);
    expect(outcomes.filter(o => o === "PASSWORD_RESET_INVALID")).toHaveLength(7);
    expect(await service.status({ sessionToken: ticket.sessionToken })).toMatchObject({ status: "refused" });
    // The lock, not admit, refuses the next start: it answers the generic response, queues no PROOF and writes the
    // delegate's own `started` DENY audit for that request's source.
    const denied = await repo.prepareSource(net(101));
    const denials = async () => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.audit_event WHERE event_type='identity.password_reset.started' AND decision='DENY' AND source_context->>'ipArgon2id'=$1`, [denied.ipArgon2id])).rows[0].n;
    expect(await proofs()).toBe(1);
    expect(await service.start({ email: a.email }, net(101))).toEqual({ message: "If this account can be recovered, instructions will arrive through an eligible channel." });
    expect(await proofs()).toBe(1);
    expect(await denials()).toBe(1);
    await db.pool.query(`UPDATE identity.password_reset_retry_lock SET locked_until=clock_timestamp()-interval '1 second' WHERE user_id=$1`, [a.id]);
    await service.start({ email: a.email }, net(102));
    expect(await proofs()).toBe(2);
    a.secret.fill(0);
  });
  it("a full source window still admits a new IPv6 /64: it gives up 64 rows with budget left and keeps the spent one (NV-39)", async () => {
    const count = async () => (await db.pool.query(`SELECT count(*)::int AS n FROM identity.password_reset_source_window`)).rows[0].n;
    const spent = `argon2id-audit:v1:${"5".repeat(64)}`, scope = `argon2id-audit:v1:${await audit.hashSourceIp("2001:db8:39:1::/64")}`;
    try {
      // Earlier cases leave live rows; the window starts empty, then holds exactly 65,536 rows.
      await db.pool.query(`DELETE FROM identity.password_reset_source_window`);
      await db.pool.query(`INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) SELECT 'argon2id-audit:v1:'||encode(sha256(('w'||g)::text::bytea),'hex'),now(),2 FROM generate_series(1,65535) g`);
      await db.pool.query(`INSERT INTO identity.password_reset_source_window(source_digest,window_started_at,uses) VALUES($1,now(),21)`, [spent]);
      expect(await count()).toBe(65536);
      // exchange admits before its bearer check, so the token "x" reaches the window.
      await expect(service.exchange({ token: "x" }, { ip: "2001:db8:39:1::7", userAgent: "it", requestId: "r" })).rejects.toThrow("PASSWORD_RESET_INVALID");
      expect(await count()).toBe(65536 - 64 + 1);
      expect((await db.pool.query(`SELECT uses FROM identity.password_reset_source_window WHERE source_digest=$1`, [spent])).rows).toEqual([{ uses: 21 }]);
      await expect(service.exchange({ token: "x" }, { ip: "2001:db8:39:1::8", userAgent: "it", requestId: "r" })).rejects.toThrow("PASSWORD_RESET_INVALID");
      expect(await count()).toBe(65536 - 64 + 1);
      expect((await db.pool.query(`SELECT uses FROM identity.password_reset_source_window WHERE source_digest=$1`, [scope])).rows).toEqual([{ uses: 2 }]);
    }
    finally {
      await db.pool.query(`DELETE FROM identity.password_reset_source_window`);
    }
  });
});
