import { seedInstalledAuth106 } from "../support/auth106.js";
import { createPreviewRecoveryApiFixture } from "../support/previewRecoveryPrincipal.js";
import { canonicalRegisterJson, registerVersionToSafeLegacyNumber, PASSWORD_RESET_POLICY_REGISTER_ROW as resetFacet, BACKUP_EMAIL_POLICY_REGISTER_ROW as backupFacet, MFA_RECOVERY_POLICY_REGISTER_ROW as mfaFacet } from "@debateai/register";
import{randomUUID}from"node:crypto";import{beforeAll,afterAll,expect,it}from"vitest";
import{Argon2WorkerPool,AuditContextHasher,createEmailBlindIndex,encrypt,generateTotpSecret,decodeBase32,totpCodeAtStep,hashPassword,type ReadableUserDekStore}from"@debateai/crypto";
import{migrate,createPool,PostgresSessionRepository,PostgresAuthenticationRiskSignalRepository}from"@debateai/db";
import{loadBootstrapRegister,persistBootstrapRegister,createPostgresRegisterPublicationPort,parseRegisterVersionText,AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS,authPolicyFromRegisterRows,MFA_POLICY_REGISTER_ROW,mfaPolicyFromValue,SESSION_POLICY_REGISTER_ROW,sessionPolicyFromValue}from"@debateai/register";
import{PostgresBackupEmailRepository,PostgresMfaRecoveryRepository}from"../../packages/db/src/email-mfa-recovery.js";
import{BackupEmailService,MfaRecoveryService}from"../../apps/api/src/email-mfa-recovery.js";
import{EmailRecoveryNotificationWorker,type EmailRecoveryMail}from"../../apps/api/src/email-mfa-mail.js";
import{BACKUP_EMAIL_POLICY_REGISTER_ROW,MFA_RECOVERY_POLICY_REGISTER_ROW,backupEmailPolicyFromValue,mfaRecoveryPolicyFromValue}from"../../packages/register/src/email-mfa-policy.js";
import{SessionService}from"../../apps/api/src/sessions.js";import{buildApi,type AskApplication}from"../../apps/api/src/index.js";
import{buildDevelopmentDeploymentRegisterPublicationRows}from"../../apps/runner/src/dev-deployment-register.js";import{TEST_DEVELOPMENT_PROVIDER_PANEL}from"../support/developmentProviderPanel.js";import{startTestDatabase,type TestDatabase}from"../support/testDatabase.js";
import{apiTestPools,createSystemTwin,provisionRlsLogins}from"../support/rls-logins.js";
let db:TestDatabase,argon:Argon2WorkerPool,audit:AuditContextHasher,pool:ReturnType<typeof createPool>,authPool:ReturnType<typeof createPool>,backupRepo:PostgresBackupEmailRepository,mfaRepo:PostgresMfaRecoveryRepository,backup:BackupEmailService,mfaRecovery:MfaRecoveryService,sessions:SessionService;
const auth=authPolicyFromRegisterRows(AUTH_POLICY_DEPLOYMENT_REGISTER_ROWS),mfa=mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),backupPolicy=backupEmailPolicyFromValue(BACKUP_EMAIL_POLICY_REGISTER_ROW.value),mfaPolicy=mfaRecoveryPolicyFromValue(MFA_RECOVERY_POLICY_REGISTER_ROW.value),blind=Buffer.alloc(32,91),keys=new Map<string,Buffer>(),messages:EmailRecoveryMail[]=[],origin="https://preview.example.test";
const users:ReadableUserDekStore={async store(id,key){keys.set(id,Buffer.from(key));},async load(id){const key=keys.get(id);if(!key)throw Error("NO_DEK");return Buffer.from(key);},async exists(id){return keys.has(id);},async destroy(){throw Error("Must preserve DEK");}};
async function createLegacyFixture(){const id=randomUUID(),email=`primary-${id}@example.test`,backupEmail=`backup-${id}@example.test`,historical=`historical-${id}@example.test`,pending=`pending-${id}@example.test`,key=Buffer.alloc(32,55),factor=randomUUID(),secret=generateTotpSecret();allLegacySecrets.push(secret);keys.set(id,key);const address=(value:string,field:string)=>encrypt(key,Buffer.from(value),["identity",field,id,"run:none",id,`user-dek:${id}`,"1"]);const primary=address(email,"user.email_ciphertext"),secondary=address(backupEmail,"user.recovery_email_ciphertext"),seed=encrypt(key,secret,["identity","mfa_factor.secret_ciphertext",factor,"run:none",id,`user-dek:${id}`,"1"]),password=await hashPassword(argon,"existing strong password",auth.password.argon2id);await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at) VALUES($1,$2,$3,$4,$5,$6,'active',clock_timestamp())`,[id,createEmailBlindIndex(blind,email),primary,secondary,password,`email-mfa-${id}`]);for(const [type,value,state]of[["email",primary,"verified"],["recovery_email",secondary,"pending_verification"]])await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,verified_at) VALUES($1,$2,$3,$4,CASE WHEN $4='verified' THEN clock_timestamp() ELSE NULL END)`,[id,type,value,state]);await db.pool.query(`INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp())`,[factor,id,seed]);return{id,email,backupEmail,historical,pending,factor,secret,password};}
const allLegacySecrets:Buffer[]=[];
const legacyAccounts:Awaited<ReturnType<typeof createLegacyFixture>>[]=[];
async function fixture(){const value=legacyAccounts.shift();if(!value)throw Error("LEGACY106_FIXTURE_EXHAUSTED");return value;}
async function receive(){for(const[flow,repository]of[["backup_email",backupRepo],["mfa_recovery",mfaRepo]]as const){const worker=new EmailRecoveryNotificationWorker({dispatch:async prepare=>{await (await prepare())?.();},flow,repository,users,authPolicy:auth,sender:{async send(mail){messages.push(mail);}},reportDiagnostic:()=>{}});await worker.reconcile(100);await worker.close();}}
// R21 (PLAN S5.3, D67): one dev provisioning run (provisionRlsLogins) serves every URL; the recovery fixture login is the
// runtime pool and its system twin, holding the same four capability roles, the target its background statements and
// role checks run on, in both modes.
const RECOVERY_SYSTEM_ROLES=["debateai_billing_runtime","debateai_password_reset_runtime","debateai_backup_email_runtime","debateai_mfa_recovery_runtime"] as const;
beforeAll(async()=>{db=await startTestDatabase();await seedInstalledAuth106(db.pool);argon=new Argon2WorkerPool();await argon.ready();for(let i=0;i<8;i++)legacyAccounts.push(await createLegacyFixture());await migrate(db.pool);const bootstrap=await loadBootstrapRegister();await persistBootstrapRegister(db.pool,bootstrap);const receipt=await createPostgresRegisterPublicationPort(db.pool).publishGeneral({publicationId:randomUUID(),baseRegisterVersion:parseRegisterVersionText(String(bootstrap.registerVersion)),rows:[...await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap,TEST_DEVELOPMENT_PROVIDER_PANEL),...[resetFacet,backupFacet,mfaFacet].map(row=>({rowKey:row.rowKey,valueJsonText:canonicalRegisterJson(row.valueAst),sourceRef:row.sourceRef}))],sourceRef:"approved email MFA native General fixture",deployment:"local"});const urls=new Map<string,string>((await provisionRlsLogins(db)).credentials());urls.set("DATABASE_URL",await createPreviewRecoveryApiFixture(db.pool,urls.get("DATABASE_URL")!));({runtime:pool,authorization:authPool}=await apiTestPools(db,import.meta.url,{runtime:urls.get("DATABASE_URL")!,system:await createSystemTwin(db,"mail_locale_email_mfa_recovery_system",RECOVERY_SYSTEM_ROLES)}));audit=new AuditContextHasher(argon,Buffer.alloc(32,65),auth.auditSourceIpKdf);backupRepo=new PostgresBackupEmailRepository(pool,audit,registerVersionToSafeLegacyNumber(receipt.registerVersion));mfaRepo=new PostgresMfaRecoveryRepository(pool,audit,registerVersionToSafeLegacyNumber(receipt.registerVersion));await backupRepo.assertRole();await mfaRepo.assertRole();backup=new BackupEmailService({repository:backupRepo,users,argon2:argon,authPolicy:auth,mfaPolicy:mfa,policy:backupPolicy});mfaRecovery=new MfaRecoveryService({repository:mfaRepo,users,argon2:argon,authPolicy:auth,mfaPolicy:mfa,policy:mfaPolicy,blindIndexKey:blind});sessions=await SessionService.create({repository:new PostgresSessionRepository(authPool,audit),riskSignals:new PostgresAuthenticationRiskSignalRepository(pool,audit,users,7776000000,128),onRiskSignalFailure:()=>{},dekStore:users,argon2:argon,authPolicy:auth,mfaPolicy:mfa,sessionPolicy:sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value,SESSION_POLICY_REGISTER_ROW.sourceRef),blindIndexKey:blind});},120000);
afterAll(async()=>{if(db)await (await provisionRlsLogins(db)).end();audit?.close();await argon?.close();await db?.stop();for(const key of keys.values())key.fill(0);for(const secret of allLegacySecrets)secret.fill(0);});

// S01-C10 (R-22, R-23, R-08, R-13; D-56, D-57, D-70): the dropdown language of each email-recovery request is the language
// its row stores, and the workers send it. The request carries the language in its cookie, as the browser sends it.
const LOCALE_COOKIE = "debateai.locale=ro";
const storedLocales = async (flow: "backup_email" | "mfa_recovery", event: string, userId: string): Promise<string[]> => {
  const table = flow === "backup_email" ? "identity.backup_email_notice" : "identity.mfa_recovery_notice";
  const control = flow === "backup_email" ? "identity.backup_email_control" : "identity.mfa_recovery_control";
  return (await db.pool.query<{ mail_locale: string }>(`SELECT n.mail_locale FROM ${table} n JOIN ${control} c USING(challenge_id) WHERE c.user_id=$1 AND n.event_kind=$2`, [userId, event])).rows.map(row => row.mail_locale);
};

// Events that fan out to every bound address write one row per address; each row must carry the stored language.
const expectStored = async (flow: "backup_email" | "mfa_recovery", event: string, userId: string, locale: string) => {
  const rows = await storedLocales(flow, event, userId);
  expect(rows.length).toBeGreaterThan(0);
  expect(new Set(rows)).toEqual(new Set([locale]));
};

it("stores the dropdown language on the backup-email PROOF and VERIFIED rows (R-22)", async () => {
  const a = await fixture(), api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions, backupEmail: backup, mfaRecovery });
  try {
    const h = { origin, "user-agent": "mail-locale backup context" };
    const login = await api.inject({ method: "POST", url: "/v1/auth/login", headers: h, payload: { email: a.email, password: "existing strong password" } });
    expect(login.statusCode).toBe(202);
    const step = Math.floor(Date.now() / 30000);
    const authenticated = await api.inject({ method: "POST", url: "/v1/auth/login", headers: h, payload: { challenge_token: login.json().challenge_token, code: totpCodeAtStep(a.secret, step - 1) } });
    expect(authenticated.statusCode).toBe(200);
    const oldCookie = (authenticated.headers["set-cookie"] as string[]).map(c => c.split(";")[0]).join("; "), csrf = /__Host-debateai-csrf=([^;]+)/.exec(oldCookie)![1];
    const userHeaders = { ...h, cookie: `${oldCookie}; ${LOCALE_COOKIE}`, "x-csrf-token": csrf };
    const request = await api.inject({ method: "POST", url: "/v1/account/backup-email/verify/start", headers: userHeaders, payload: { password: "existing strong password", code: totpCodeAtStep(a.secret, step) } });
    expect(request.statusCode).toBe(202);
    await receive();
    const verify = messages.find(m => m.flow === "backup_email" && m.event === "PROOF" && m.recipient === a.backupEmail)!;
    expect(verify.token).toBeDefined();
    expect(verify.mailLocale).toBe("ro");
    expect(await storedLocales("backup_email", "PROOF", a.id)).toEqual(["ro"]);
    expect((await api.inject({ method: "POST", url: "/v1/account/backup-email/verify/confirm", headers: { origin, cookie: LOCALE_COOKIE }, payload: { token: verify.token } })).json()).toEqual({ status: "verified" });
    await expectStored("backup_email", "VERIFIED", a.id, "ro");
  } finally { a.secret.fill(0); await api.close(); }
});

it("stores the dropdown language on the PROOF, STARTED, WAITING, FINISH and COMPLETED rows of an authenticator recovery (R-23)", async () => {
  const a = await fixture(), api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions, backupEmail: backup, mfaRecovery });
  let secret: Buffer | undefined;
  try {
    const ctx = { origin, "user-agent": "mail-locale recovery context", cookie: LOCALE_COOKIE };
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: ctx, payload: { email: a.email, destination: "primary" } })).statusCode).toBe(202);
    await receive();
    const proof = messages.find(m => m.flow === "mfa_recovery" && m.event === "PROOF" && m.recipient === a.email)!;
    expect(proof.token).toBeDefined();
    expect(proof.mailLocale).toBe("ro");
    expect(await storedLocales("mfa_recovery", "PROOF", a.id)).toEqual(["ro"]);
    const exchange = await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/exchange", headers: ctx, payload: { token: proof.token, password: "existing strong password" } });
    expect(exchange.statusCode, exchange.body).toBe(200);
    await expectStored("mfa_recovery", "STARTED", a.id, "ro");
    const cookie = (exchange.headers["set-cookie"] as string[]).map(c => c.split(";")[0]).join("; "), csrf = /__Host-debateai-mfa-recovery-csrf=([^;]+)/.exec(cookie)![1];
    const scoped = { ...ctx, cookie: `${cookie}; ${LOCALE_COOKIE}`, "x-mfa-recovery-csrf-token": csrf };
    const post = async (path: string, payload: object) => { const r = await api.inject({ method: "POST", url: `/v1/auth/mfa-recovery/${path}`, headers: scoped, payload }); expect(r.statusCode, r.body).toBe(200); return r.json(); };
    const setup = await post("totp/begin", {}); secret = decodeBase32(setup.secret);
    await post("totp/verify", { code: totpCodeAtStep(secret, Math.floor(Date.now() / 30000)) });
    const codes = await post("codes/generate", {}); await post("codes/confirm", { code: codes.recovery_codes[0] });
    expect(await post("complete", {})).toMatchObject({ status: "waiting" });
    await expectStored("mfa_recovery", "WAITING", a.id, "ro");
    // The 24 hours are moved back, as the reference suite does, so the finish link can be used.
    await db.pool.query(`UPDATE identity.mfa_recovery_control SET waiting_at=waiting_at-interval '25 hours',not_before=not_before-interval '25 hours' WHERE user_id=$1 AND stage='WAITING'`, [a.id]);
    await db.pool.query(`UPDATE identity.mfa_recovery_notice n SET available_at=n.available_at-interval '25 hours' FROM identity.mfa_recovery_control c WHERE c.challenge_id=n.challenge_id AND c.user_id=$1 AND n.event_kind='FINISH'`, [a.id]);
    await receive();
    const finishMail = messages.find(m => m.flow === "mfa_recovery" && m.event === "FINISH" && m.recipient === a.email)!;
    expect(finishMail.finishToken).toBeDefined();
    expect(finishMail.mailLocale).toBe("ro");
    await expectStored("mfa_recovery", "FINISH", a.id, "ro");
    const finished = await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/finish", headers: ctx, payload: { token: finishMail.finishToken, password: "existing strong password" } });
    expect(finished.statusCode, finished.body).toBe(200);
    await expectStored("mfa_recovery", "COMPLETED", a.id, "ro");
  } finally { secret?.fill(0); a.secret.fill(0); await api.close(); }
});

it("stores the dropdown language on a CANCELLED row, and English on a PROOF row whose request carries none (R-23, R-08)", async () => {
  const a = await fixture(), b = await fixture(), api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions, backupEmail: backup, mfaRecovery });
  try {
    const ctx = { origin, "user-agent": "mail-locale cancel context", cookie: LOCALE_COOKIE };
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: ctx, payload: { email: a.email, destination: "primary" } })).statusCode).toBe(202);
    await receive();
    const proof = messages.find(m => m.flow === "mfa_recovery" && m.event === "PROOF" && m.recipient === a.email)!;
    expect(proof.cancelToken).toBeDefined();
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/cancel", headers: ctx, payload: { token: proof.cancelToken } })).statusCode).toBe(200);
    await expectStored("mfa_recovery", "CANCELLED", a.id, "ro");
    const plain = { origin, "user-agent": "mail-locale english context" };
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: plain, payload: { email: b.email, destination: "primary" } })).statusCode).toBe(202);
    expect(await storedLocales("mfa_recovery", "PROOF", b.id)).toEqual(["en"]);
  } finally { a.secret.fill(0); b.secret.fill(0); await api.close(); }
});

it("an expired challenge writes no mfa_recovery_notice row (C10.8, R-23)", async () => {
  const a = await fixture(), api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions, backupEmail: backup, mfaRecovery });
  try {
    const ctx = { origin, "user-agent": "mail-locale expiry context", cookie: LOCALE_COOKIE };
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: ctx, payload: { email: a.email, destination: "primary" } })).statusCode).toBe(202);
    const eventsOf = async () => (await db.pool.query<{ event_kind: string }>(`SELECT n.event_kind FROM identity.mfa_recovery_notice n JOIN identity.mfa_recovery_control c USING(challenge_id) WHERE c.user_id=$1 ORDER BY n.event_kind`, [a.id])).rows.map(row => row.event_kind);
    expect(await eventsOf()).toEqual(["PROOF"]);
    await db.pool.query(`UPDATE identity.mfa_recovery_control SET expires_at=clock_timestamp()-interval '1 minute' WHERE user_id=$1 AND stage NOT IN ('COMPLETED','CANCELLED','REFUSED','EXPIRED')`, [a.id]);
    await mfaRepo.expire(10);
    expect((await db.pool.query<{ stage: string }>(`SELECT stage FROM identity.mfa_recovery_control WHERE user_id=$1`, [a.id])).rows.map(row => row.stage)).toEqual(["EXPIRED"]);
    expect(await eventsOf()).toEqual(["PROOF"]);
  } finally { a.secret.fill(0); await api.close(); }
});

it("stores the dropdown language on a REFUSED row, written by the fifth failed proof (R-23)", async () => {
  const a = await fixture(), api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions, backupEmail: backup, mfaRecovery });
  try {
    const ctx = { origin, "user-agent": "mail-locale refused context", cookie: LOCALE_COOKIE };
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: ctx, payload: { email: a.email, destination: "primary" } })).statusCode).toBe(202);
    await receive();
    const proof = messages.find(m => m.flow === "mfa_recovery" && m.event === "PROOF" && m.recipient === a.email)!;
    for (let attempt = 0; attempt < 5; attempt++) {
      await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/exchange", headers: ctx, payload: { token: proof.token, password: "wrong current password" } });
    }
    await expectStored("mfa_recovery", "REFUSED", a.id, "ro");
  } finally { a.secret.fill(0); await api.close(); }
});

it("stores the dropdown language on the CANCELLED row of a signed-in cancellation (cancel-current, R-23)", async () => {
  const a = await fixture(), api = buildApi({ application: {} as AskApplication, allowedOrigin: origin, sessions, backupEmail: backup, mfaRecovery });
  // Its own source address: the recovery admission counts per source, and the other tests share the default one.
  const remoteAddress = "198.51.100.77";
  try {
    const ctx = { origin, "user-agent": "mail-locale cancel-current context", cookie: LOCALE_COOKIE };
    expect((await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/start", headers: ctx, remoteAddress, payload: { email: a.email, destination: "primary" } })).statusCode).toBe(202);
    await receive();
    const proof = messages.find(m => m.flow === "mfa_recovery" && m.event === "PROOF" && m.recipient === a.email)!;
    const exchange = await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/exchange", headers: ctx, remoteAddress, payload: { token: proof.token, password: "existing strong password" } });
    expect(exchange.statusCode, exchange.body).toBe(200);
    const cookie = (exchange.headers["set-cookie"] as string[]).map(c => c.split(";")[0]).join("; "), csrf = /__Host-debateai-mfa-recovery-csrf=([^;]+)/.exec(cookie)![1];
    const cancelled = await api.inject({ method: "POST", url: "/v1/auth/mfa-recovery/cancel-current", headers: { ...ctx, cookie: `${cookie}; ${LOCALE_COOKIE}`, "x-mfa-recovery-csrf-token": csrf }, remoteAddress, payload: {} });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    await expectStored("mfa_recovery", "CANCELLED", a.id, "ro");
  } finally { a.secret.fill(0); await api.close(); }
});
