import { createPreviewRecoveryApiFixture } from "../support/previewRecoveryPrincipal.js";
import { canonicalRegisterJson, PASSWORD_RESET_POLICY_REGISTER_ROW as resetFacet, BACKUP_EMAIL_POLICY_REGISTER_ROW as backupFacet, MFA_RECOVERY_POLICY_REGISTER_ROW as mfaFacet } from "@debateai/register";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
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
import { provisionDevelopmentDatabasePrincipals } from "../../apps/runner/src/dev-database-principals.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
let db: TestDatabase, root: string, argon: Argon2WorkerPool, audit: AuditContextHasher, apiPool: ReturnType<typeof createPool>, authPool: ReturnType<typeof createPool>, repo: PostgresPasswordResetRepository, service: PasswordResetService;
let credentialUrls: Map<string, string>;
const auth = authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS), mfa = mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), recovery = recoveryPolicyFromRegisterRows([RECOVERY_POLICY_REGISTER_ROW]), policy = passwordResetPolicyFromValue(PASSWORD_RESET_POLICY_REGISTER_ROW.value, PASSWORD_RESET_POLICY_REGISTER_ROW.sourceRef);
const keys = new Map<string, Buffer>(), blind = Buffer.alloc(32, 41), messages: PasswordResetMail[] = [], source = { ip: "203.0.113.77", userAgent: "genuine-password-reset-test", requestId: "fixture" }, origin = "https://preview.example.test";
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
  await db.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`, [factor, id, seed]);
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
beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  root = await mkdtemp("/private/tmp/password-reset-native-");
  const bootstrap = await loadBootstrapRegister();
  await persistBootstrapRegister(db.pool, bootstrap);
  expect(await readPasswordResetPolicy(db.pool, bootstrap.registerVersion)).toBeNull();
  const rows = [...await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL),...[resetFacet,backupFacet,mfaFacet].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))];
  const publication = await createPostgresRegisterPublicationPort(db.pool).publishGeneral({ publicationId: randomUUID(), baseRegisterVersion: parseRegisterVersionText(String(bootstrap.registerVersion)), rows, sourceRef: "password-only reset native General fixture", deployment: "local" });
  expect(await readPasswordResetPolicy(db.pool, Number(publication.registerVersion))).toMatchObject({ maximumElapsedMs: 1800000 });
  await provisionDevelopmentDatabasePrincipals({ adminPool: db.pool, adminDatabaseUrl: db.connectionString, credentialFilePath: join(root, "database-principals.env") });
  const credentials = new Map((await readFile(join(root, "database-principals.env"), "utf8")).split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => {
    const i = line.indexOf("=");
    return [line.slice(0, i), line.slice(i + 1)];
  }));
credentials.set("DATABASE_URL",await createPreviewRecoveryApiFixture(db.pool,credentials.get("DATABASE_URL")!));  credentialUrls = credentials;
  apiPool = createPool(credentials.get("DATABASE_URL")!);
  authPool = createPool(credentials.get("AUTHORIZATION_DATABASE_URL")!);
  argon = new Argon2WorkerPool();
  await argon.ready();
  audit = new AuditContextHasher(argon, Buffer.alloc(32, 61), auth.auditSourceIpKdf);
  repo = new PostgresPasswordResetRepository(apiPool, audit, Number(publication.registerVersion));
  await repo.assertRole();
  service = new PasswordResetService({ repository: repo, users, argon2: argon, authPolicy: auth, mfaPolicy: mfa, passwordResetPolicy: policy, blindIndexKey: blind, reportDiagnostic: () => {
    } });
}, 120000);
afterAll(async () => {
  await apiPool?.end();
  await authPool?.end();
  audit?.close();
  await argon?.close();
  await db?.stop();
  if (root)
    await rm(root, { recursive: true, force: true });
  for (const key of keys.values())
    key.fill(0);
});
describe("genuine native-role password-only HTTP reset", () => {
  it("grants all reset capabilities only to the native API, without table or owner/private-content authority", async () => {
    const capabilities = (await db.pool.query(`SELECT oid,oid::regprocedure::text AS signature FROM pg_proc WHERE pronamespace='identity'::regnamespace AND proname=ANY($1) ORDER BY proname`, [["password_reset_prepare", "password_reset_start", "password_reset_exchange", "password_reset_read", "password_reset_complete", "password_reset_cancel", "password_reset_cancel_session", "password_reset_admit", "password_reset_failure", "expire_password_reset", "password_reset_claim_notice", "password_reset_finish_notice"]])).rows;
    const tableOid = (await db.pool.query(`SELECT 'identity.password_reset_control'::regclass::oid AS oid`)).rows[0].oid;
    expect(capabilities).toHaveLength(12);
    for (const environmentKey of ["DATABASE_URL", "AUTHORIZATION_DATABASE_URL", "LIVENESS_DATABASE_URL", "SUPPORT_DATABASE_URL", "ERASURE_DATABASE_URL"]) {
      const pool = createPool(credentialUrls.get(environmentKey)!);
      try {
        const grants = (await pool.query(`SELECT has_function_privilege(current_user,oid,'EXECUTE') AS allowed FROM unnest($1::oid[]) oid`, [capabilities.map(cap => cap.oid)])).rows;
        expect(grants.map(r => r.allowed)).toEqual(Array(12).fill(environmentKey === "DATABASE_URL"));
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
      expect((await erasurePool.query(`SELECT identity.prepare_account_erasure($1,'{}'::uuid[],'{}'::uuid[],'{}'::uuid[]) AS outcome`, [erasure])).rows[0].outcome).toBe("PREPARED");
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
});
