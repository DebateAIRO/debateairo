import { withMailLocale } from '../../packages/db/src/mail-locale.js';
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CONTENT_CIPHERTEXT_SENTINEL, configureContentEncryption, createPool, migrate, PostgresConsumerSecurityRepository, PostgresDataExportRepository, PostgresDataExportSource, PostgresInvestigationRepository, PostgresSessionRepository, PostgresSocialIdentityRepository, PostgresWebEvidenceRepository, PostgresWebResearchedRepository, RunRepository, runInRequestScope, ServeDisclosureRepository, type Pool, type WebSealed } from "@debateai/db";
import { StoryRepository } from "@debateai/story";
import { WorkItemRepository } from "@debateai/battery";
import { Argon2WorkerPool, ContentCipher, decrypt, encrypt, FileRunContentKeyStore, FileUserDekStore,
  generateDek, generateTotpSecret, hashPassword, hashToken, loadKek, openRecord, sealRecord, totpCodeAtStep, type ContentCarrier } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue,
  SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue } from "@debateai/register";
import { renderMail } from "@debateai/mail-templates";
import { DataExportApplication } from "../../apps/api/src/data-export/service.js";
import { FileDataExportStore } from "../../apps/api/src/data-export/store.js";
import { collectSnapshot, type ExportDecryptors, type OwnerViewPort } from "../../apps/api/src/data-export/snapshot.js";
import { runContentOpener } from "../../apps/api/src/data-export/run-content.js";
import { loadArchiveCatalog } from "../../apps/api/src/data-export/archive-catalog.js";
import { TemplatedDataExportMail } from "../../apps/api/src/data-export/mail.js";
import type { TemplatedMail } from "../../apps/api/src/mail-channel.js";
import { OwnerViewAdapter } from "../../apps/api/src/data-export/owner-view-adapter.js";
import { buildApi, CSRF_COOKIE_NAME, PostgresAskApplication, SESSION_COOKIE_NAME } from "../../apps/api/src/index.js";
import { SessionService } from "../../apps/api/src/sessions.js";
import { ConsumerSecurityService } from "../../apps/api/src/consumer-security.js";
import { SocialStepUpService } from "../../apps/api/src/social-step-up.js";
import { RepositoryAnswerStoryApplication } from "../../apps/api/src/stories.js";
import { RepositoryAnswerDisclosureApplication } from "../../apps/api/src/disclosures.js";
import { SOCIAL_BROWSER_COOKIE } from "../../apps/api/src/social-auth.js";
import { SocialProviders } from "../../apps/api/src/social-providers/provider.js";
import { socialHash } from "../../apps/api/src/social-providers/hashes.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { apiTestPools, provisionRlsLogins, type ApiTestPools, type RlsLogins } from "../support/rls-logins.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { persistTerminalRun } from "../support/settledRun.js";
import { consumerFixture } from "../support/consumerWebAuthnFixtures.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";

function entries(zip: Buffer): Record<string, string> {
  const result: Record<string, string> = {};
  for (let offset = 0; offset + 30 < zip.length && zip.readUInt32LE(offset) === 0x04034b50;) {
    const method = zip.readUInt16LE(offset + 8), size = zip.readUInt32LE(offset + 18), nameSize = zip.readUInt16LE(offset + 26);
    const name = zip.subarray(offset + 30, offset + 30 + nameSize).toString("ascii");
    const compressed = zip.subarray(offset + 30 + nameSize, offset + 30 + nameSize + size);
    result[name] = (method === 8 ? inflateRawSync(compressed) : compressed).toString("utf8");
    offset += 30 + nameSize + size;
  }
  return result;
}

const providerStepUpFlowInsert = `WITH fixture_time AS MATERIALIZED (SELECT clock_timestamp() AS at)
        INSERT INTO identity.social_flow(state_hash,cookie_hash,binding_hash,nonce_hash,retention_hash,
        provider,configuration,purpose,next_path,user_id,session_id,session_token_hash,security_epoch,created_at,expires_at,
        proof_hash,continuation_cookie_hash,issuer,app_scope,subject,authorization_binding)
        SELECT $1,$2,$3,$4,$5,'google',$6,'PROVIDER_STEP_UP','/',$7,$8,$9,0,fixture_time.at,fixture_time.at+interval '5 minutes',
        $10,$11,'https://accounts.google.com',$12,$13,'{"action":"EXPORT_DATA"}'::jsonb FROM fixture_time`;

const riskSignalInsert = `WITH fixture_time AS MATERIALIZED (SELECT clock_timestamp() AS at)
      INSERT INTO identity.authentication_risk_signal(risk_signal_id,user_id,signal_kind,context_ciphertext,observed_at,expires_at)
      SELECT $1,$2,'LOGIN_SUCCESS',$3::jsonb,fixture_time.at,fixture_time.at+interval '7776000 seconds' FROM fixture_time`;

/**
 * Row-level security S01 (PLAN S5.2, DECISIONS D67): a distinct Pool object over `pool`, its methods bound to it, so
 * statements keep `pool`'s own routing. Content encryption is configured once per Pool object
 * (CONTENT_CIPHER_ALREADY_CONFIGURED), and apiTestPools hands every test the same pools, so each test that configures a
 * cipher configures it on a facade of its own; in superuser mode every field is the harness pool itself, and the facades
 * also keep the ask application's admission pools distinct objects (ASK_ADMISSION_DATABASE_POOLS_MUST_BE_SEPARATE).
 */
function poolFacade(pool: Pool): Pool {
  return new Proxy(pool, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

describe("data export over a real database and encrypted file store", () => {
  let db: TestDatabase, runtime: Pool, workerRuntime: ReturnType<typeof createPool>, root: string;
  let pools: ApiTestPools, logins: RlsLogins | undefined;
  const sent: TemplatedMail[] = [];
  const lines: string[] = [];
  beforeAll(async () => {
    db = await startTestDatabase();
    await migrate(db.pool);
    await db.pool.query("CREATE ROLE data_export_e2e_auth LOGIN PASSWORD 'data-export-e2e-only' IN ROLE debateai_authorization_runtime");
    await db.pool.query("CREATE ROLE data_export_e2e_worker LOGIN PASSWORD 'data-export-e2e-worker-only' IN ROLE debateai_data_export_worker");
    const url = new URL(db.connectionString); url.username = "data_export_e2e_auth"; url.password = "data-export-e2e-only";
    // R21 (PLAN S5.2 (3)): the file's own authorization login is wired as main.ts wires authorizationPool, with the
    // authorization system login as its cross-account target, in both modes; every other API pool is apiTestPools'.
    pools = await apiTestPools(db, import.meta.url, { authorization: url.toString() });
    logins = await provisionRlsLogins(db);
    runtime = pools.authorization;
    url.username = "data_export_e2e_worker"; url.password = "data-export-e2e-worker-only";
    workerRuntime = createPool(url.toString());
    // Outside a request scope the authorization pool runs on its cross-account target; its own connections are the login.
    expect((await runInRequestScope(() => runtime.query("SELECT current_user name"))).rows[0].name).toBe("data_export_e2e_auth");
    expect((await workerRuntime.query("SELECT current_user name")).rows[0].name).toBe("data_export_e2e_worker");
    root = await mkdtemp(join(tmpdir(), "data-export-e2e-"));
  }, 180_000);
  afterAll(async () => { await logins?.end(); await workerRuntime?.end(); await db?.stop(); if (root) await rm(root, { recursive: true, force: true }); });
  afterEach(async () => {
    if (db) await db.pool.query("UPDATE identity.data_export SET status='CANCELLED',closed_at=clock_timestamp() WHERE status='PREPARING'");
  });

  async function account(email = `${randomUUID()}@example.test`, passwordHash: string | null = "fixture-password") {
    const userId = randomUUID(), sessionId = randomUUID(), grantToken = randomBytes(32).toString("base64url");
    const user = (await db.pool.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES($1,$2,'{}',$4,$3,'active',clock_timestamp()) RETURNING owner_ref,audit_token`,
    [userId, createHash("sha256").update(userId).digest(), userId, passwordHash])).rows[0];
    await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
      VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
    [sessionId, userId, `sha256:${createHash("sha256").update(sessionId).digest("hex")}`, `sha256:${createHash("sha256").update(userId).digest("hex")}`]);
    await db.pool.query("INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())", [userId]);
    await db.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_account_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'EXPORT_DATA',$4,clock_timestamp(),clock_timestamp()+interval '5 minutes')`,
    [randomUUID(), hashToken("step-up-grant", grantToken), sessionId, userId]);
    return { userId, sessionId, ownerRef: user.owner_ref as string, auditToken: user.audit_token as string, grantToken, email };
  }

  function application(directory: string, email: string, workerId = randomUUID(), recoveryEmail?: string, recordsKey?: Buffer,
    userKey?: Buffer, actualOwnerView?: OwnerViewPort,
    runContent: ExportDecryptors["openRunContent"] = async () => { throw Error("RUN_CONTENT_NOT_EXPECTED"); }) {
    const repo = new PostgresDataExportRepository(runtime, workerRuntime, {
      hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64)
    } as never);
    const source = new PostgresDataExportSource(workerRuntime);
    const store = new FileDataExportStore({ directory, users: { load: async () => Buffer.alloc(32, 7) } });
    const ownerView = new OwnerViewAdapter({ application: {} as never },
      { exists: async () => false }, { readStates: async () => [] });
    const mail = new TemplatedDataExportMail({
      sendTemplated: async (message: (typeof sent)[number]) => { sent.push(message); }
    } as never);
    const app = new DataExportApplication({ repository: repo, store,
      collect: async (claim, worker) => {
        try { return await collectSnapshot({ claim, workerId: worker, source, ownerView: actualOwnerView ?? ownerView,
        decrypt: { openUserField: async (userId, field, envelope) => userKey === undefined
          ? (envelope as { test_email?: string })?.test_email ?? (field === "user.recovery_email_ciphertext" ? (recoveryEmail ?? email) : email)
          : decrypt(userKey, envelope as Parameters<typeof decrypt>[1],
            ["identity", field, userId, "run:none", userId, `user-dek:${userId}`, "1"]).toString("utf8"),
          openRecord: (aad, ciphertext) => recordsKey === undefined ? "{}" : openRecord(recordsKey, aad, ciphertext).toString("utf8"),
          openSupport: async () => "fixture-support", openRunContent: runContent }, now: () => new Date() }); }
        catch (error) { if (actualOwnerView) { let current: unknown = error; for (let i = 0; i < 5 && current instanceof Error; i++) { lines.push(`E3:${current.stack ?? current}`); current = current.cause; } } throw error; }
      },
      archiveCatalog: loadArchiveCatalog, mail, publicAppUrl: "https://example.test", workerId,
      log: line => lines.push(line) });
    return { app, repo, store };
  }

  const context = { ip: "192.0.2.5", userAgent: "export-e2e", requestId: "fixture" };
  async function accepted(a: Awaited<ReturnType<typeof account>>, app: DataExportApplication) {
    const result = await app.request({ userId: a.userId, sessionId: a.sessionId, grantToken: a.grantToken, locale: "en", source: context });
    expect(result.kind).toBe("ACCEPTED");
    return result;
  }
  async function completed(a: Awaited<ReturnType<typeof account>>, directory = join(root, randomUUID())) {
    const f = application(directory, a.email);
    await accepted(a, f.app);
    await f.app.runOnce();
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 1", [a.userId])).rows[0];
    expect(row.status).toBe("SENT");
    return { ...f, row, directory };
  }

  function deliveredToken(exportId: string): string {
    const url = sent.find(item => item.messageId === exportId)?.params.downloadUrl;
    expect(url).toMatch(/^https:\/\/example\.test\/export#[A-Za-z0-9_-]+$/);
    return url!.split("#")[1]!;
  }

  async function seedRuns(a: Awaited<ReturnType<typeof account>>, count: number): Promise<string[]> {
    const ids: string[] = [];
    const runs = new RunRepository(db.pool);
    for (let i = 0; i < count; i++) {
      const runId = await runs.startRun({
        questionLine: `export-fixture-question-${a.userId}-${i}`,
        askContract: { audience: "data-export-test" },
        principal: { kind: "legacy", legacyAskerId: `export-${a.userId}-${i}` },
        sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
        tierProvenanceRef: "data-export-test", compositionBudgetTier: "low",
        depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
        strangerSampleRate: 1, envelopeBasis: { source: "data-export-test" },
        registerVersion: 1, batteryVersion: "data-export-test", batteryRows: []
      });
      await db.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, a.ownerRef]);
      ids.push(runId);
    }
    return ids;
  }

  it("E1 verifies password, provider and passkey HTTP step-ups before export", async () => {
    const a = await account(), { app } = application(join(root, randomUUID()), a.email);
    const argon2 = new Argon2WorkerPool({ workers: 1 });
    await argon2.ready();
    const password = "Export fixture strong password!", authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
    const secret = generateTotpSecret(), dek = Buffer.alloc(32, 47), factorId = randomUUID();
    const sessionToken = randomBytes(32).toString("base64url"), csrfToken = randomBytes(32).toString("base64url");
    let api: ReturnType<typeof buildApi> | undefined, providerApi: ReturnType<typeof buildApi> | undefined,
      passkeyApi: ReturnType<typeof buildApi> | undefined;
    try {
      const passwordHash = await hashPassword(argon2, password, authPolicy.password.argon2id);
      await db.pool.query('UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1', [a.userId, passwordHash]);
      await withMailLocale(db.pool, 'en', (c) => c.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp(),clock_timestamp())",
        [factorId, a.userId, encrypt(dek, secret, ["identity", "mfa_factor.secret_ciphertext", factorId, "run:none", a.userId, `user-dek:${a.userId}`, "1"])]));
      const audit = { hashSourceIp: async () => "a".repeat(64), hashUserAgent: async () => "b".repeat(64) } as never;
      const sessions = await SessionService.create({ repository: new PostgresSessionRepository(runtime, audit),
        riskSignals: { recordForSession: async () => "recorded" } as never, onRiskSignalFailure: () => undefined,
        dekStore: { load: async () => Buffer.from(dek) } as never, argon2, authPolicy,
        mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),
        sessionPolicy: sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef),
        blindIndexKey: Buffer.alloc(32, 5), dummyPasswordHash: passwordHash });
      const source = { ip: "127.0.0.1", userAgent: "export-e2e", requestId: "E1" };
      await db.pool.query("UPDATE identity.session SET token_hash=$2,csrf_token_hash=$3,binding_context=$4::jsonb WHERE session_id=$1",
        [a.sessionId, hashToken("session", sessionToken), hashToken("csrf", csrfToken),
          JSON.stringify({ user_agent_hash: sessions.consumerProducer().bindingHash(source) })]);
      api = buildApi({ application: {} as never, sessions, dataExport: app, allowedOrigin: "https://example.test" });
      const headers = { origin: "https://example.test", "user-agent": "export-e2e",
        cookie: `${SESSION_COOKIE_NAME}=${sessionToken}; ${CSRF_COOKIE_NAME}=${csrfToken}`, "x-csrf-token": csrfToken };
      const stepped = await api.inject({ method: "POST", url: "/v1/auth/step-up", headers,
        payload: { password, code: totpCodeAtStep(secret, Math.floor(Date.now() / 30_000)), authorization: { action: "EXPORT_DATA" } } });
      expect(stepped.statusCode).toBe(200);
      const cookies = (stepped.headers["set-cookie"] as string[]).map(value => value.split(";")[0]).join("; ");
      const nextCsrf = stepped.json().csrf_token as string;
      const requested = await api.inject({ method: "POST", url: "/v1/account/export",
        headers: { ...headers, cookie: cookies, "x-csrf-token": nextCsrf },
        payload: { step_up_grant: stepped.json().step_up_grant.token, locale: "en" } });
      expect(requested.statusCode).toBe(202);
      expect(requested.json().status).toBe("PREPARING");
      const provider = await account(), providerToken = randomBytes(32).toString("base64url"),
        providerCsrf = randomBytes(32).toString("base64url"), browserToken = randomBytes(32).toString("base64url"),
        continuation = randomBytes(32).toString("base64url"), providerFactorId = randomUUID(), providerSecret = generateTotpSecret();
      const configuration = { provider: "google" as const, clientId: "export-fixture", appScope: "export-fixture",
        callback: "https://example.test/v1/auth/social/google/callback", configuration: `sha256:${"c".repeat(64)}` };
      const providers = new SocialProviders([configuration], { operation: async () => ({ providers: [{
        provider: configuration.provider, clientId: configuration.clientId, appScope: configuration.appScope,
        callback: configuration.callback }] }) });
      const providerSubject = randomUUID();
      await db.pool.query("INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration) VALUES($1,'google','https://accounts.google.com',$2,$3,$4)",
        [provider.userId, configuration.appScope, providerSubject, configuration.configuration]);
      // A fixture clock with six-minute jumps makes two independent reads violate social_flow's five-minute CHECK.
      await db.pool.query("CREATE SCHEMA fixture_clock");
      await db.pool.query(`CREATE FUNCTION fixture_clock.clock_timestamp() RETURNS timestamptz LANGUAGE plpgsql VOLATILE AS $function$
        DECLARE n integer;
        BEGIN
          n := COALESCE(current_setting('fixture.calls', true)::integer, 0) + 1;
          PERFORM set_config('fixture.calls', n::text, false);
          RETURN '2026-01-01T00:00:00Z'::timestamptz + n * interval '6 minutes';
        END $function$`);
      const clockClient = await db.pool.connect();
      const clockState = socialHash("state", randomUUID());
      try {
        await clockClient.query("SET search_path = fixture_clock, pg_catalog, identity, public");
        await expect(clockClient.query(providerStepUpFlowInsert,
          [clockState, socialHash("flow-cookie", randomUUID()), sessions.consumerProducer().bindingHash(source),
            socialHash("nonce", randomUUID()), socialHash("browser", randomUUID()), configuration.configuration,
            provider.userId, provider.sessionId, hashToken("session", providerToken), socialHash("step-up", randomUUID()),
            socialHash("browser", randomUUID()), configuration.appScope, providerSubject])).resolves.toMatchObject({ rowCount: 1 });
        expect((await clockClient.query("SELECT expires_at = created_at + interval '5 minutes' AS exact FROM identity.social_flow WHERE state_hash=$1", [clockState])).rows[0].exact).toBe(true);
      } finally {
        await clockClient.query("RESET search_path");
        clockClient.release();
        await db.pool.query("DROP SCHEMA fixture_clock CASCADE");
      }
      await withMailLocale(db.pool, 'en', (c) => c.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp',$3,'active',clock_timestamp(),clock_timestamp())",
        [providerFactorId, provider.userId, encrypt(dek, providerSecret,
          ["identity", "mfa_factor.secret_ciphertext", providerFactorId, "run:none", provider.userId, `user-dek:${provider.userId}`, "1"])]));
      await db.pool.query("UPDATE identity.session SET token_hash=$2,csrf_token_hash=$3,binding_context=$4::jsonb WHERE session_id=$1",
        [provider.sessionId, hashToken("session", providerToken), hashToken("csrf", providerCsrf),
          JSON.stringify({ user_agent_hash: sessions.consumerProducer().bindingHash(source) })]);
      await db.pool.query(providerStepUpFlowInsert,
        [socialHash("state", randomUUID()), socialHash("flow-cookie", randomUUID()), sessions.consumerProducer().bindingHash(source),
          socialHash("nonce", randomUUID()), socialHash("browser", randomUUID()), configuration.configuration,
          provider.userId, provider.sessionId, hashToken("session", providerToken), socialHash("step-up", continuation),
          socialHash("browser", browserToken), configuration.appScope, providerSubject]);
      const providerExport = application(join(root, randomUUID()), provider.email).app;
      providerApi = buildApi({ application: {} as never, sessions, dataExport: providerExport,
        allowedOrigin: "https://example.test", socialStepUp: new SocialStepUpService(
          new PostgresSocialIdentityRepository(runtime, audit), providers, sessions.consumerProducer(),
          { publicAppUrl: "https://example.test", users: { load: async () => Buffer.from(dek) } as never,
            argon2, mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value) }) });
      const providerHeaders = { origin: "https://example.test", "user-agent": "export-e2e",
        cookie: `${SESSION_COOKIE_NAME}=${providerToken}; ${CSRF_COOKIE_NAME}=${providerCsrf}; ${SOCIAL_BROWSER_COOKIE}=${browserToken}`,
        "x-csrf-token": providerCsrf };
      const providerStep = await providerApi.inject({ method: "POST", url: "/v1/account/social/step-up/complete",
        headers: providerHeaders, payload: { continuation_token: continuation,
          code: totpCodeAtStep(providerSecret, Math.floor(Date.now() / 30_000)) } });
      expect(providerStep.statusCode).toBe(200);
      const providerCookies = (providerStep.headers["set-cookie"] as string[]).map(value => value.split(";")[0]).join("; ");
      const providerRequested = await providerApi.inject({ method: "POST", url: "/v1/account/export",
        headers: { ...providerHeaders, cookie: providerCookies, "x-csrf-token": providerStep.json().csrf_token },
        payload: { step_up_grant: providerStep.json().step_up_grant.token, locale: "en" } });
      expect(providerRequested.statusCode).toBe(202);
      providerSecret.fill(0);
      const p = { userId: randomUUID(), sessionId: randomUUID(), email: `${randomUUID()}@example.test` };
      const passkey = consumerFixture();
      const passwordless = await db.pool.connect();
      try {
        await passwordless.query("BEGIN");
        await passwordless.query(`INSERT INTO identity."user"(user_id,email_blind_index,email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
          VALUES($1,$2,'{}',NULL,$3,'active',clock_timestamp())`,
        [p.userId, createHash("sha256").update(p.userId).digest(), p.userId]);
        await passwordless.query(`INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration)
          VALUES($1,'google','https://accounts.google.com','export-passkey',$2,$3)`, [p.userId, randomUUID(), `sha256:${"d".repeat(64)}`]);
        await passwordless.query("COMMIT");
      } catch (error) { await passwordless.query("ROLLBACK"); throw error; }
      finally { passwordless.release(); }
      await db.pool.query(`INSERT INTO identity.session(session_id,user_id,token_hash,csrf_token_hash,binding_context,idle_expires_at,absolute_expires_at,last_mfa_at)
        VALUES($1,$2,$3,$4,'{}',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp())`,
      [p.sessionId, p.userId, `sha256:${createHash("sha256").update(p.sessionId).digest("hex")}`,
        `sha256:${createHash("sha256").update(p.userId).digest("hex")}`]);
      await db.pool.query(`INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at)
        VALUES($1,'email','{}','verified',clock_timestamp(),clock_timestamp())`, [p.userId]);
      const pSessionToken = randomBytes(32).toString("base64url"), pCsrf = randomBytes(32).toString("base64url");
      await db.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)", [p.userId, passkey.handle]);
      await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin,label)
        VALUES($1,$2,$3,0,'multiDevice',true,'app.example.test','https://app.example.test','only-key')`,
        [p.userId, passkey.credentialId, passkey.k.wire.toString("base64url")]));
      await db.pool.query("UPDATE identity.session SET token_hash=$2,csrf_token_hash=$3,binding_context=$4::jsonb WHERE session_id=$1",
        [p.sessionId, hashToken("session", pSessionToken), hashToken("csrf", pCsrf),
          JSON.stringify({ user_agent_hash: sessions.consumerProducer().bindingHash(source) })]);
      const pExport = application(join(root, randomUUID()), p.email).app;
      passkeyApi = buildApi({ application: {} as never, sessions, dataExport: pExport, allowedOrigin: "https://app.example.test",
        consumerSecurity: new ConsumerSecurityService(new PostgresConsumerSecurityRepository(runtime, audit),
          sessions.consumerProducer(), { publicAppUrl: "https://app.example.test", argon2,
            mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value), authPolicy }) });
      const pHeaders = { origin: "https://app.example.test", "user-agent": "export-e2e",
        cookie: `${SESSION_COOKIE_NAME}=${pSessionToken}; ${CSRF_COOKIE_NAME}=${pCsrf}`, "x-csrf-token": pCsrf };
      const options = await passkeyApi.inject({ method: "POST", url: "/v1/auth/passkeys/step-up/options",
        headers: pHeaders, payload: { authorization: { action: "EXPORT_DATA" } } });
      expect(options.statusCode).toBe(200);
      const diagnostic = await new PostgresConsumerSecurityRepository(runtime, audit).readStepUp({
        userId: p.userId, sessionId: p.sessionId, tokenHash: hashToken("session", pSessionToken),
        handleHash: `sha256:${createHash("sha256").update(`consumer-passkey:STEP_UP\0${options.json().challenge_handle}`).digest("hex")}`,
        bindingHash: sessions.consumerProducer().bindingHash(source), credentialId: passkey.credentialId });
      expect(diagnostic).not.toBeNull();
      expect(diagnostic).toMatchObject({ publicKey: passkey.k.wire.toString("base64url"),
        userHandle: passkey.handle, credentialId: passkey.credentialId,
        origin: "https://app.example.test", rpId: "app.example.test" });
      const proof = await passkeyApi.inject({ method: "POST", url: "/v1/auth/passkeys/step-up/complete",
        headers: pHeaders, payload: { challenge_handle: options.json().challenge_handle,
          credential: passkey.assertion(options.json().options.challenge, { userHandle: passkey.handle }) } });
      expect(proof.statusCode, proof.body).toBe(200);
      const pCookies = (proof.headers["set-cookie"] as string[]).map(value => value.split(";")[0]).join("; ");
      const pRequested = await passkeyApi.inject({ method: "POST", url: "/v1/account/export",
        headers: { ...pHeaders, cookie: pCookies, "x-csrf-token": proof.json().csrf_token },
        payload: { step_up_grant: proof.json().step_up_grant.token, locale: "en" } });
      expect(pRequested.statusCode).toBe(202);
      const passwordlessRow = (await db.pool.query(`SELECT password_hash,
        (SELECT count(*)::int FROM identity.social_identity WHERE user_id=$1) social_count,
        (SELECT count(*)::int FROM identity.consumer_passkey_credential WHERE user_id=$1) passkey_count
        FROM identity."user" WHERE user_id=$1`, [p.userId])).rows[0];
      expect(passwordlessRow).toEqual({ password_hash: null, social_count: 1, passkey_count: 1 });
    } finally { if (passkeyApi) await passkeyApi.close(); if (providerApi) await providerApi.close();
      if (api) await api.close(); secret.fill(0); dek.fill(0); await argon2.close(); }
  });

  it("E2 includes seeded section markers and excludes authentication and export bookkeeping", async () => {
    const a = await account("owner-marker@example.test"), b = await account("other-marker@example.test");
    const factorId = randomUUID(), subjectHandle = randomBytes(32).toString("base64url"), passkeyLabel = "matrix-passkey-label";
    const recordsKey = Buffer.alloc(32, 9), acceptanceId = randomUUID(), quoteId = randomUUID();
    const chargeId = randomBytes(16).toString("hex"), customerId = randomUUID(), supportId = randomUUID(), supportCaseId = randomUUID();
    let noticeId = randomUUID();
    const riskId = randomUUID(), executionRef = randomUUID();
    const publicationRef = randomUUID(), visibilityId = randomUUID(), visibilityActor = randomUUID();
    const legacyAuditId = randomUUID(), anonymousSupportId = randomUUID();
    const evidence = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId }, Buffer.from('{"ip":"192.0.2.7"}'));
    const location = sealRecord(recordsKey, { table: "billing.quote", column: "location_ciphertext", rowId: quoteId }, Buffer.from('{"country":"RO"}'));
    const ip = sealRecord(recordsKey, { table: "billing.location_evidence", column: "ip_ciphertext", rowId: chargeId }, Buffer.from('{"ip":"192.0.2.8"}'));
    await db.pool.query("INSERT INTO identity.registration_region(user_id,country_code) VALUES($1,'RO')", [a.userId]);
    await db.pool.query("INSERT INTO identity.age_check(user_id,outcome,min_age_applied,country_code,rule_version,context,checked_at) VALUES($1,'passed',18,'RO','matrix-v1','registration',clock_timestamp())", [a.userId]);
    await withMailLocale(db.pool, 'en', (c) => c.query("INSERT INTO identity.mfa_factor(mfa_factor_id,user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,$2,'totp','{}','active',clock_timestamp(),clock_timestamp())", [factorId, a.userId]));
    await db.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)", [a.userId, subjectHandle]);
    await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin,label)
      VALUES($1,$2,$3,0,'singleDevice',false,'example.test','https://example.test',$4)`, [a.userId, randomBytes(32).toString("base64url"), randomBytes(65).toString("base64url"), passkeyLabel]));
    await db.pool.query("INSERT INTO identity.recovery_code(user_id,code_hash) VALUES($1,$2)", [a.userId, `matrix-code-${randomUUID()}`]);
    await db.pool.query(`INSERT INTO identity.social_identity(user_id,provider,issuer,app_scope,subject,configuration)
      VALUES($1,'google','https://accounts.google.com','matrix','matrix-provider-subject',$2)`, [a.userId, `sha256:${"c".repeat(64)}`]);
    await db.pool.query(`INSERT INTO identity.email_change_request(email_change_id,user_id,new_email_blind_index,new_email_ciphertext,
      confirm_token_hash,cancel_token_hash,issued_at,last_sent_at,expires_at)
      VALUES($1,$2,$3,$4::jsonb,$5,$6,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour')`,
    [randomUUID(), a.userId, createHash("sha256").update(randomUUID()).digest(), JSON.stringify({ test_email: "matrix-new-email@example.test" }),
      `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`,
      `sha256:${createHash("sha256").update(randomUUID()).digest("hex")}`]);
    await db.pool.query(`INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id)
      VALUES($1,$2,'TERMS','99.1',$3,'en','SIGN_UP',clock_timestamp(),$4,$5)`, [acceptanceId, a.ownerRef, "a".repeat(64), evidence.ciphertext, evidence.keyId]);
    await db.pool.query("INSERT INTO identity.sensitive_data_consent(user_id,notice_version,locale,consented_at) VALUES($1,'matrix-consent-v1','en',clock_timestamp())", [a.userId]);
    await db.pool.query("INSERT INTO billing.customer(customer_id,owner_ref,created_at,created_locale) VALUES($1,$2,clock_timestamp(),'ro')", [customerId, a.ownerRef]);
    await db.pool.query("INSERT INTO billing.customer_xmoney(customer_id,environment,xmoney_customer_id,at) VALUES($1,'stage','123456789',clock_timestamp())", [customerId]);
    await db.pool.query(`INSERT INTO billing.quote(quote_id,owner_ref,plan_id,kind,net_micros,tax_micros,total_micros,tax_country,tax_rate_bp,tax_status,tax_name,created_at,expires_at,location_ciphertext,key_id,currency)
      VALUES($1,$2,'PLUS','SUBSCRIBE',10000,0,10000,'RO',0,'NON_TAXABLE','matrix-tax',clock_timestamp(),clock_timestamp()+interval '1 hour',$3,$4,'RON')`, [quoteId, a.ownerRef, location.ciphertext, location.keyId]);
    await db.pool.query(`INSERT INTO billing.charge(charge_id,owner_ref,subscription_id,kind,attempt,period_start,period_end,
      net_micros,tax_micros,total_micros,currency,created_at,payment_provider,payment_environment)
      VALUES($1,$2,$3,'CARD_CHECK',1,clock_timestamp(),clock_timestamp()+interval '30 days',0,0,0,'USD',clock_timestamp(),'netopia','sandbox')`, [chargeId, a.ownerRef, randomUUID()]);
    await db.pool.query(`INSERT INTO billing.location_evidence(charge_id,ip_country,declared_country,card_country,verdict,ip_ciphertext,key_id,at)
      VALUES($1,'RO','RO','RO','CONFIRMED_BY_PERSON',$2,$3,clock_timestamp())`, [chargeId, ip.ciphertext, ip.keyId]);
    const supportClient = await db.pool.connect();
    try {
      await supportClient.query("BEGIN");
      await supportClient.query(`INSERT INTO support.session(session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at,shredded_at)
        VALUES($1,$2,$3,'ro','CLOSED',$4,clock_timestamp(),clock_timestamp())`, [supportId, createHash("sha256").update(supportId).digest("hex"), a.ownerRef, "a".repeat(64)]);
      await supportClient.query("INSERT INTO support.session_key(session_id,wrapped_key,created_at,destroyed_at) VALUES($1,$2,clock_timestamp(),clock_timestamp())", [supportId, Buffer.alloc(61)]);
      const caseCiphertext = Buffer.alloc(29); caseCiphertext[0] = 2;
      await supportClient.query(`INSERT INTO support."case"(case_id,token_sha256,session_id,identity_owner_ref,language,created_at,
        transcript_snapshot_ciphertext,state,shredded_at)
        VALUES($1,$2,$3,$4,'ro',clock_timestamp(),$5,'CLOSED',clock_timestamp())`,
      [supportCaseId, createHash("sha256").update(supportCaseId).digest("hex"), supportId, a.ownerRef, caseCiphertext]);
      await supportClient.query("INSERT INTO support.case_key(case_id,wrapped_key,created_at,destroyed_at) VALUES($1,$2,clock_timestamp(),clock_timestamp())", [supportCaseId, Buffer.alloc(61)]);
      await supportClient.query("INSERT INTO support.shred_audit(at,os_user,target_kind,target_ref,keys_destroyed) VALUES(clock_timestamp(),'fixture','owner',$1,2)", [a.ownerRef]);
      await supportClient.query("COMMIT");
    } catch (error) { await supportClient.query("ROLLBACK"); throw error; }
    finally { supportClient.release(); }
    const [runId] = await seedRuns(a, 1), deletedAt = new Date();
    // SPEC-v11 row C7 (V-42): the deleted run carries a rotation pin; R25 keeps it on the UNRECOVERABLE entry.
    await db.pool.query(`INSERT INTO core.run_role_rotation(run_id,rule,writer_provider_ref,writer_model_id,writer_maker,checker_provider_ref,checker_model_id,
      checker_maker,storyteller_provider_ref,storyteller_model_id,storyteller_maker,story_checker_provider_ref,story_checker_model_id,story_checker_maker,eligible_model_ids)
      VALUES($1,'LEAST_SHARE_SEEDED_TIE_V1','p:w','matrix-rotation-writer','Maker A','p:c','matrix-rotation-checker','Maker B','p:s','matrix-rotation-storyteller',
      'Maker C','p:sc','matrix-rotation-story-checker','Maker D',ARRAY['matrix-rotation-writer','matrix-rotation-checker','matrix-rotation-storyteller','matrix-rotation-story-checker']::text[])`, [runId]);
    const readableRun = (await seedRuns(a, 1))[0]!;
    const readableAnswer = await persistTerminalRun({ pool: db.pool, runId: readableRun, fixtureKey: "matrix",
      factBundle: { facts: ["matrix-answer-fact"], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
        reversalPoint: "matrix-reversal", buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
    // R21: the ask application's pools are the API's (main.ts: pool, serverAskAdmissionPool, legacyAskAdmissionPool);
    // encryptedPool only seeds the published run below, outside every request, so it stays on the harness superuser.
    const ownerPool = poolFacade(pools.runtime), serverAdmission = poolFacade(pools.serverAskAdmission),
      legacyAdmission = poolFacade(pools.legacyAskAdmission);
    const encryptedPool = createPool(db.connectionString);
    try {
    const ask = new PostgresAskApplication(ownerPool, {} as never, { releaseKey: TEST_RELEASE_KEY, registerVersion: 1 } as never, undefined, ownerPool,
      { server: serverAdmission, legacy: legacyAdmission });
    const users = new FileUserDekStore(join(root, randomUUID()), loadKek(generateDek()));
    await users.store(a.userId, generateDek());
    const keys = new FileRunContentKeyStore(join(root, randomUUID()), users, async () => a.userId);
    configureContentEncryption(encryptedPool, new ContentCipher(keys));
    configureContentEncryption(ownerPool, new ContentCipher(keys));
    const publishedRun = await new RunRepository(encryptedPool).startRun({
      questionLine: "matrix-published-question", askContract: { audience: "data-export-test" },
      principal: { kind: "server", userId: a.userId, ownerRef: a.ownerRef },
      sessionId: a.sessionId, callerScope: "ASKER", asOf: new Date(),
      askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
      tierProvenanceRef: "data-export-test", compositionBudgetTier: "low",
      depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
      strangerSampleRate: 1, envelopeBasis: { source: "data-export-test" },
      registerVersion: 1, batteryVersion: "data-export-test", batteryRows: []
    });
    await db.pool.query("UPDATE identity.session SET created_at='2026-10-09T01:00:00Z',last_seen_at='2026-10-09T01:23:45Z' WHERE session_id=$1", [a.sessionId]);
    await db.pool.query("INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at) VALUES($1,clock_timestamp(),'2030-05-04T03:02:01Z')", [a.userId]);
    await db.pool.query(`INSERT INTO serve.publication_snapshot(publication_ref,run_id,format_version,content_ciphertext,created_at)
      VALUES($1,$2,1,$3::jsonb,clock_timestamp())`, [publicationRef, publishedRun,
      JSON.stringify({ v: 1, keyId: `publication-snapshot:${publicationRef}:v1`, nonce: "AA", ct: "AA", tag: "AA" })]);
    await db.pool.query(`INSERT INTO identity.publication_event_binding(user_id,session_id,run_id,action,grant_id,grant_token_hash,
      visibility_event_id,visibility_actor_ref,audit_id,audit_actor_ref,audit_target_ref,denied_audit_id,
      denied_audit_actor_ref,denied_audit_target_ref,created_at,expires_at)
      VALUES($1,$2,$3,'PUBLISH',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp(),clock_timestamp()+interval '5 minutes')`,
    [a.userId, a.sessionId, publishedRun, randomUUID(), hashToken("step-up-grant", a.grantToken), visibilityId,
      visibilityActor, randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()]);
    await db.pool.query(`INSERT INTO core.run_visibility_event(run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,
      actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',clock_timestamp(),ledger.allocate_sequence())`,
    [visibilityId, publishedRun, publicationRef, visibilityActor]);
    await db.pool.query("INSERT INTO ledger.call_prompt(attempt_id,run_id,prompt_fingerprint,prompt_text) VALUES($1,$2,$3,'matrix-internal-prompt')",
      [randomUUID(), runId, "a".repeat(64)]);
    await db.pool.query("INSERT INTO core.legacy_run_cutover(run_id,marked_at) VALUES($1,clock_timestamp())", [runId]);
    await db.pool.query("INSERT INTO core.legacy_run_claim(run_id,owner_ref,claimed_at,audit_id) VALUES($1,$2,clock_timestamp(),$3)", [runId, a.ownerRef, legacyAuditId]);
    await db.pool.query("INSERT INTO legal.account_closure(owner_ref,closed_at) VALUES($1,'2030-06-07T08:09:10Z')", [a.ownerRef]);
    const channelId = (await db.pool.query("SELECT channel_binding_id FROM identity.channel_binding WHERE user_id=$1 AND channel_type='email'", [a.userId])).rows[0].channel_binding_id;
    await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.consumer_security_notice(notice_id,user_id,channel_binding_id,channel_ciphertext,event_kind)
      VALUES($1,$2,$3,'{}','METHOD_CHANGED') ON CONFLICT(user_id,channel_binding_id,event_kind) DO NOTHING`, [noticeId, a.userId, channelId]));
    noticeId = (await db.pool.query("SELECT notice_id FROM identity.consumer_security_notice WHERE user_id=$1 AND channel_binding_id=$2 AND event_kind='METHOD_CHANGED'", [a.userId, channelId])).rows[0].notice_id;
    const riskEnvelope = encrypt(Buffer.alloc(32, 11), Buffer.from("matrix-risk-signal"),
      ["identity", "authentication_risk_signal.context_ciphertext", riskId, "run:none", a.userId, `auth-risk:${a.userId}:v1`, "1"]);
    const probeRiskId = randomUUID();
    const probeRiskEnvelope = encrypt(Buffer.alloc(32, 11), Buffer.from("matrix-risk-probe"),
      ["identity", "authentication_risk_signal.context_ciphertext", probeRiskId, "run:none", a.userId, `auth-risk:${a.userId}:v1`, "1"]);
    await db.pool.query("CREATE SCHEMA fixture_risk_clock");
    await db.pool.query(`CREATE FUNCTION fixture_risk_clock.clock_timestamp() RETURNS timestamptz LANGUAGE plpgsql VOLATILE AS $function$
      DECLARE n integer;
      BEGIN
        n := COALESCE(current_setting('fixture.risk_calls', true)::integer, 0) + 1;
        PERFORM set_config('fixture.risk_calls', n::text, false);
        RETURN '2026-01-01T00:00:00Z'::timestamptz + n * interval '6 minutes';
      END $function$`);
    const riskClockClient = await db.pool.connect();
    try {
      await riskClockClient.query("SET search_path = fixture_risk_clock, pg_catalog, identity, public");
      await expect(riskClockClient.query(riskSignalInsert,
        [probeRiskId, a.userId, JSON.stringify(probeRiskEnvelope)])).resolves.toMatchObject({ rowCount: 1 });
      expect((await riskClockClient.query("SELECT expires_at = observed_at + interval '7776000 seconds' AS exact FROM identity.authentication_risk_signal WHERE risk_signal_id=$1", [probeRiskId])).rows[0].exact).toBe(true);
    } finally {
      await riskClockClient.query("RESET search_path");
      riskClockClient.release();
      await db.pool.query("DROP SCHEMA fixture_risk_clock CASCADE");
    }
    await db.pool.query(riskSignalInsert,
    [riskId, a.userId, JSON.stringify(riskEnvelope)]);
    await db.pool.query("INSERT INTO identity.account_security_hold(user_id,held,changed_at) VALUES($1,false,'2031-07-08T09:10:11Z')", [a.userId]);
    await db.pool.query(`INSERT INTO identity.run_execution_binding(execution_ref,user_id,identity_session_id,run_id,created_at)
      VALUES($1,$2,$3,$4,clock_timestamp())`, [executionRef, a.userId, a.sessionId, runId]);
    const anonymousClient = await db.pool.connect();
    try {
      await anonymousClient.query("BEGIN");
      await anonymousClient.query(`INSERT INTO support.session(session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at,shredded_at)
        VALUES($1,$2,NULL,'en','CLOSED',$3,clock_timestamp(),clock_timestamp())`,
      [anonymousSupportId, createHash("sha256").update(anonymousSupportId).digest("hex"), "b".repeat(64)]);
      await anonymousClient.query("INSERT INTO support.session_key(session_id,wrapped_key,created_at,destroyed_at) VALUES($1,$2,clock_timestamp(),clock_timestamp())",
        [anonymousSupportId, Buffer.alloc(61)]);
      await anonymousClient.query("INSERT INTO support.shred_audit(at,os_user,target_kind,target_ref,keys_destroyed) VALUES(clock_timestamp(),'fixture','session',$1,1)", [anonymousSupportId]);
      await anonymousClient.query("COMMIT");
    } catch (error) { await anonymousClient.query("ROLLBACK"); throw error; }
    finally { anonymousClient.release(); }
    await db.pool.query("INSERT INTO serve.private_run_erasure_tombstone(run_id,completed_at,destroyed_key_count,already_absent_key_count) VALUES($1,$2,0,1)", [runId, deletedAt]);
    const oldHash = `sha256:${"f".repeat(64)}`, leaseOwner = randomUUID(), oldId = randomUUID();
    await db.pool.query(`WITH t AS (SELECT clock_timestamp() at) INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,link_token_hash,archive_sha256,archive_bytes,sent_at,expires_at)
      SELECT $1,$2,$3,'en','SENT',t.at-interval '2 hours',$4,$5,100,t.at-interval '1 hour',t.at+interval '23 hours' FROM t`,
    [oldId, a.userId, a.sessionId, oldHash, "a".repeat(64)]);
    await db.pool.query("INSERT INTO identity.password_recovery_retry_lock(user_id,locked_until) VALUES($1,clock_timestamp()+interval '1 hour')", [a.userId]);
    const f = application(join(root, randomUUID()), a.email, leaseOwner, undefined, undefined, undefined,
      new OwnerViewAdapter({ application: ask }, { exists: async () => true }, { readStates: async () => [] }, a.sessionId));
    await accepted(a, f.app);
    await f.app.runOnce();
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1 AND status='SENT' ORDER BY requested_at DESC LIMIT 1", [a.userId])).rows[0];
    const { store } = f;
    const archive = entries(await store.read(row.export_id, a.userId));
    const inRows = [
      ["A1", "account.json", "owner-marker@example.test"], ["A2", "account.json", "email"],
      ["A3", "account.json", '"country_code": "RO"'], ["A4", "account.json", "matrix-v1"],
      ["A5", "account.json", "2030-05-04"],
      ["B1", "security.json", "totp"], ["B2", "security.json", passkeyLabel],
      ["B3", "security.json", '"unused_count": 1'],
      ["B4", "security.json", "last_seen_at"],
      ["B5", "security.json", "matrix-provider-subject"],
      ["B6", "security.json", "matrix-new-email@example.test"],
      ["B7", "security.json", "password_recovery_retry_lock"],
      ["C1", "debates.json", runId],
      ["C2", "debates.json", readableAnswer.answerId], ["C3", "debates.json", "PUBLISHED"],
      ["C7", "debates.json", "matrix-rotation-story-checker"],
      ["D1", "consents.json", "99.1"], ["D2", "consents.json", "matrix-consent-v1"],
      ["E1", "billing.json", "123456789"], ["E2", "billing.json", "matrix-tax"],
      ["E3", "billing.json", "CONFIRMED_BY_PERSON"],
      ["F1/session", "support.json", supportId], ["F1/case", "support.json", supportCaseId],
      ["G1", "activity.json", "identity.data_export.requested"]
    ] as const;
    for (const [specRow, filename, marker] of inRows)
      expect(archive[filename], specRow).toContain(marker);
    expect(JSON.parse(archive["security.json"]!).sessions.some((session: { last_seen_at: string }) =>
      Date.parse(session.last_seen_at) === Date.parse("2026-10-09T01:23:45Z")), "B4 seeded session time").toBe(true);
    const deleted = JSON.parse(archive["debates.json"]!).debates.find((debate: { reference: string }) => debate.reference === runId);
    expect(Date.parse(deleted.deleted_at), "C1a").toBe(deletedAt.getTime());
    const published = JSON.parse(archive["debates.json"]!).debates.find((debate: { reference: string }) => debate.reference === publishedRun);
    expect(published).toMatchObject({ reference: publishedRun, content_status: "READABLE" });
    const all = JSON.stringify(archive);
    const outRows = [["X1", hashToken("step-up-grant", a.grantToken)], ["X2", noticeId], ["X3", riskId],
      ["X4", "2031-07-08"], ["X5", executionRef], ["X6/link", oldHash], ["X6/lease", leaseOwner],
      ["C4", publicationRef], ["C5", "matrix-internal-prompt"], ["C6", legacyAuditId],
      ["D3", "2030-06-07"], ["F2", anonymousSupportId],
      ["Z1/email", b.email], ["Z1/pseudonym", b.userId]] as const;
    for (const [specRow, marker] of outRows) expect(all, specRow).not.toContain(marker);
    expect(JSON.parse(archive["security.json"]!).recovery_requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "password_recovery_retry_lock", state: "LOCKED" })
    ]));
    } finally { await encryptedPool.end(); }
  });

  it("E3 projects a readable encrypted run through the same owner route", async () => {
    // R21: the API reads through the runtime pool (main.ts: pool) and its admission and run-provision pools; the run
    // and its content are seeded outside every request on seedPool, the harness superuser, with the same cipher.
    const a = await account(), secretDir = join(root, randomUUID()), contentPool = poolFacade(pools.runtime);
    const seedPool = createPool(db.connectionString);
    const serverAdmission = poolFacade(pools.serverAskAdmission), legacyAdmission = poolFacade(pools.legacyAskAdmission);
    let api: ReturnType<typeof buildApi> | undefined;
    try {
      const users = new FileUserDekStore(secretDir, loadKek(generateDek()));
      await users.store(a.userId, generateDek());
      const keys = new FileRunContentKeyStore(secretDir, users, async ownerRef => {
        if (ownerRef !== a.ownerRef) throw Error("WRONG_OWNER");
        return a.userId;
      });
      const cipher = new ContentCipher(keys);
      configureContentEncryption(contentPool, cipher);
      configureContentEncryption(seedPool, cipher);
      const ask = new PostgresAskApplication(contentPool, {} as never, { releaseKey: TEST_RELEASE_KEY, registerVersion: 1 } as never, undefined,
        pools.contentProvision, { server: serverAdmission, legacy: legacyAdmission });
      const question = `encrypted-owner-question-${randomUUID()}`;
      const runId = await new RunRepository(seedPool).startRun({
        questionLine: question, askContract: { audience: "data-export-test" },
        principal: { kind: "server", userId: a.userId, ownerRef: a.ownerRef },
        sessionId: a.sessionId, callerScope: "ASKER", asOf: new Date(),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
        tierProvenanceRef: "data-export-test", compositionBudgetTier: "low",
        depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
        strangerSampleRate: 1, envelopeBasis: { source: "data-export-test" },
        registerVersion: 1, batteryVersion: "data-export-test", batteryRows: []
      });
      const nodeId = randomUUID(), artifactId = randomUUID(), restatementId = randomUUID();
      const prepared = await cipher.prepareRun(runId);
      const nodeEnvelope = prepared.encrypt("core.node", nodeId, { claimText: "encrypted-export-node" });
      const nodeAttestation = prepared.attestEnvelope("core.node", nodeId, "content_ciphertext", nodeEnvelope);
      const artifactEnvelope = prepared.encrypt("ledger.raw_artifact", artifactId, { rawText: "node provenance" });
      const artifactAttestation = prepared.attestEnvelope("ledger.raw_artifact", artifactId, "content_ciphertext", artifactEnvelope);
      const restatementEnvelope = prepared.encrypt("core.stranger_restatement", restatementId, { restatementText: "node restated" });
      const restatementAttestation = prepared.attestEnvelope("core.stranger_restatement", restatementId, "content_ciphertext", restatementEnvelope);
      prepared.close();
      await seedPool.query(`INSERT INTO ledger.raw_artifact(raw_artifact_id,attempt_id,run_id,provider_ref,provider,model_id,maker,
        raw_text,metadata_json,parse_status,content_hash,contract_hash,at_seq,content_ciphertext,content_attestation)
        VALUES($1,$2,$3,'fixture-ref','fixture-provider','fixture-model','fixture-maker',$4,'{}','PARSED',$5,'fixture-contract',
          ledger.allocate_sequence(),$6::jsonb,$7)`,
      [artifactId, randomUUID(), runId, CONTENT_CIPHERTEXT_SENTINEL, "a".repeat(64), JSON.stringify(artifactEnvelope), artifactAttestation]);
      await seedPool.query(`INSERT INTO core.node(node_id,run_id,claim_text,claim_type,parent_node_id,child_kind,depth,sibling_ordinal,
        materialized_path,generation_status,path_status,exploration_decision,provenance_ref,way_of_knowing,locator,
        value_laden,position_label,is_folder,created_at_seq,relevant_as_of,content_ciphertext,content_attestation)
        VALUES($1,$2,$3,'unknown',NULL,NULL,0,0,'0','complete','active','continue',$6,'REASONING',NULL,
          false,NULL,false,ledger.allocate_sequence(),clock_timestamp(),$4::jsonb,$5)`,
      [nodeId, runId, CONTENT_CIPHERTEXT_SENTINEL, JSON.stringify(nodeEnvelope), nodeAttestation, artifactId]);
      await seedPool.query(`INSERT INTO ledger.reduced_judgement(run_id,node_id,raw_artifact_ref,tau,number_kind,source_ref,
        producer,replay_handle,way_of_knowing,at_seq)
        VALUES($1,$2,$3,0.8,'fixture','fixture-source','fixture-producer','fixture-replay','REASONING',ledger.allocate_sequence())`,
      [runId, nodeId, artifactId]);
      await seedPool.query(`INSERT INTO core.stranger_restatement(restatement_id,run_id,subject_kind,subject_id,restatement_text,
        check_status,at_seq,content_ciphertext,content_attestation)
        VALUES($1,$2,'node',$3,$4,'PASS',ledger.allocate_sequence(),$5::jsonb,$6)`,
      [restatementId, runId, nodeId, CONTENT_CIPHERTEXT_SENTINEL, JSON.stringify(restatementEnvelope), restatementAttestation]);
      const workItemId = await new WorkItemRepository(seedPool).enqueue({ runId, batteryRowId: "Q1",
        nodeSet: [nodeId], commandKey: `test-layer:data-export:${runId}` });
      const terminal = await persistTerminalRun({ pool: seedPool, runId, fixtureKey: "data-export", workItemId,
        factBundle: { facts: ["encrypted-export-fact"], residualObjections: [], badges: [],
          conditionMarks: ["DEFECT"], reversalPoint: "encrypted-export-reversal",
          buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null } });
      const answerCipher = await cipher.prepareRun(runId);
      const secondAnswerEnvelope = answerCipher.encrypt("serve.answer", `${terminal.answerId}:2`, { answerForm: null });
      const secondAnswerAttestation = answerCipher.attestEnvelope("serve.answer", `${terminal.answerId}:2`, "content_ciphertext", secondAnswerEnvelope);
      answerCipher.close();
      const versionColumns = (await seedPool.query(`SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid='serve.answer'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated=''
          AND a.attidentity='' ORDER BY a.attnum`)).rows.map(item => item.attname as string);
      const names = versionColumns.map(name => `"${name}"`).join(",");
      const values = versionColumns.map(name => name === "answer_version" ? '"answer_version"+1'
        : name === "sealed_at_seq" ? "ledger.allocate_sequence()"
        : name === "content_ciphertext" ? "$2::jsonb" : name === "content_attestation" ? "$3" : `"${name}"`).join(",");
      await seedPool.query(`INSERT INTO serve.answer(${names}) SELECT ${values} FROM serve.answer
        WHERE answer_id=$1 AND answer_version=1`, [terminal.answerId, JSON.stringify(secondAnswerEnvelope), secondAnswerAttestation]);
      await db.pool.query(`INSERT INTO serve.serve_disclosure(answer_id,answer_version,run_id,writer_planned_ref,checker_planned_ref,
        writer_fallback,checker_fallback,checker_same_as_writer)
        VALUES($1,1,$2,'fixture-writer','fixture-checker',false,false,false)`, [terminal.answerId, runId]);
      const stories = new RepositoryAnswerStoryApplication(new StoryRepository(contentPool));
      const disclosures = new RepositoryAnswerDisclosureApplication(new ServeDisclosureRepository(contentPool));
      const ownerDeps = { application: ask, stories, disclosures };
      const fixture = application(join(root, randomUUID()), a.email, randomUUID(), undefined, undefined, undefined,
        new OwnerViewAdapter(ownerDeps, keys, { readStates: async () => [] }, a.sessionId));
      const ownerToken = randomBytes(32).toString("base64url");
      api = buildApi({ ...ownerDeps, allowedOrigin: "https://example.test",
        sessions: { authenticate: async (token: string) => token === ownerToken ? {
          session: { asker_id: `owner:${a.ownerRef}`, session_id: a.sessionId, caller_scope: "ASKER",
            ownership_provenance: "server_session", provisional_identity_model: false },
          userId: a.userId, ownerRef: a.ownerRef, tokenHash: "fixture", csrfTokenHash: "fixture", authKind: "cookie"
        } : null, verifyCsrf: () => false } as never });
      await accepted(a, fixture.app);
      await fixture.app.runOnce();
      // D55: the inline application accepts ownerToken for a.sessionId, so that session row holds ownerToken's hash and
      // the database's rls.* functions derive account A from the credential the request carries. Set after the export
      // request: its step-up grant is bound to the session's token hash at issue (identity.bind_consumer_grant_generation,
      // migrations/0100_consumer_security_recovery.sql:629-643), so a new hash before consumption refuses the grant.
      await db.pool.query("UPDATE identity.session SET token_hash=$2 WHERE session_id=$1", [a.sessionId, hashToken("session", ownerToken)]);
      const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 1", [a.userId])).rows[0];
      expect(row.status, lines.join("\n")).toBe("SENT");
      const debate = JSON.parse(entries(await fixture.store.read(row.export_id, a.userId))["debates.json"]!).debates[0];
      const route = await api.inject({ method: "GET", url: `/v1/runs/${runId}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${ownerToken}` } });
      expect(route.statusCode).toBe(200);
      expect(debate).toMatchObject({ reference: runId, content_status: "READABLE", run: route.json() });
      expect(debate.run.question_line).toBe(question);
      const get = async (url: string) => {
        const response = await api!.inject({ method: "GET", url,
          headers: { cookie: `${SESSION_COOKIE_NAME}=${ownerToken}` } });
        expect(response.statusCode, url).toBe(200);
        return response.json() as unknown;
      };
      expect(debate.run_answer).toEqual(await get(`/v1/runs/${runId}/answer`));
      expect(await get(`/v1/answers/${terminal.answerId}/nodes/${nodeId}`)).toMatchObject({ node_id: nodeId });
      for (const answer of debate.answers) {
        expect(answer.answer_id).toBe(terminal.answerId);
        expect(answer.versions.length).toBeGreaterThanOrEqual(2);
        for (const version of answer.versions) {
          const base = `/v1/answers/${terminal.answerId}`;
          expect(version.answer).toEqual(await get(`${base}?version=${version.version}`));
          expect(version.inspection).toEqual(await get(`${base}/inspection?version=${version.version}`));
          for (const nodeId of Object.keys(version.nodes))
            expect(version.nodes[nodeId]).toEqual(await get(`${base}/nodes/${nodeId}`));
        }
        expect(answer.ledger_digest).toEqual(await get(`/v1/answers/${terminal.answerId}/ledger-digest`));
        expect(answer.story).toEqual(await get(`/v1/answers/${terminal.answerId}/story`));
        expect(answer.disclosure).toEqual(await get(`/v1/answers/${terminal.answerId}/disclosure`));
      }
    } finally { if (api) await api.close(); await seedPool.end(); }
  });

  it("E4 excludes credential hashes and link token from the archive", async () => {
    const totpSecret = `totpsecret${randomUUID().replaceAll("-", "")}`;
    const codeHash = `codehash${randomUUID().replaceAll("-", "")}`;
    const credentialId = `credential${randomUUID().replaceAll("-", "")}`;
    const publicKey = `publickey${randomUUID().replaceAll("-", "")}`;
    const a = await account();
    await withMailLocale(db.pool, 'en', (c) => c.query("INSERT INTO identity.mfa_factor(user_id,factor_type,secret_ciphertext,state,created_at,verified_at) VALUES($1,'totp',$2::jsonb,'active',clock_timestamp(),clock_timestamp())", [a.userId, JSON.stringify({ marker: totpSecret })]));
    await db.pool.query("INSERT INTO identity.recovery_code(user_id,code_hash) VALUES($1,$2)", [a.userId, codeHash]);
    await db.pool.query("INSERT INTO identity.consumer_passkey_subject(user_id,user_handle) VALUES($1,$2)", [a.userId, randomBytes(32).toString("base64url")]);
    await withMailLocale(db.pool, 'en', (c) => c.query(`INSERT INTO identity.consumer_passkey_credential(user_id,credential_id,public_key,signature_counter,device_type,backed_up,rp_id,origin,label)
      VALUES($1,$2,$3,0,'singleDevice',false,'example.test','https://example.test','personal')`, [a.userId, credentialId, publicKey]));
    const secrets = (await db.pool.query(`SELECT u.password_hash,encode(u.email_blind_index,'hex') email_blind_index,
      s.token_hash FROM identity."user" u JOIN identity.session s ON s.user_id=u.user_id WHERE u.user_id=$1`, [a.userId])).rows[0];
    const { store, row } = await completed(a);
    const archive = JSON.stringify(entries(await store.read(row.export_id, a.userId)));
    for (const secret of [secrets.password_hash, secrets.token_hash, secrets.email_blind_index,
      totpSecret, codeHash, credentialId, publicKey, a.grantToken, deliveredToken(row.export_id), row.link_token_hash]) {
      expect(archive, `leaked ${String(secret).slice(0, 12)}`).not.toContain(secret);
    }
  });

  it("E5 fails closed and sends no mail if the user key cannot open", async () => {
    const destroyed = await account(), [runId] = await seedRuns(destroyed, 1);
    const sessionId = randomUUID(), caseId = randomUUID(), tombstonedAt = new Date();
    await db.pool.query("INSERT INTO serve.private_run_erasure_tombstone(run_id,completed_at,destroyed_key_count,already_absent_key_count) VALUES($1,$2,0,1)", [runId, tombstonedAt]);
    const caseCiphertext = Buffer.alloc(29); caseCiphertext[0] = 2;
    const supportClient = await db.pool.connect();
    try {
      await supportClient.query("BEGIN");
      await supportClient.query(`INSERT INTO support.session(session_id,session_token_sha256,identity_owner_ref,language,state,kb_version,created_at,shredded_at)
        VALUES($1,$2,$3,'en','CLOSED',$4,clock_timestamp(),clock_timestamp())`, [sessionId, createHash("sha256").update(sessionId).digest("hex"), destroyed.ownerRef, "a".repeat(64)]);
      await supportClient.query("INSERT INTO support.session_key(session_id,wrapped_key,created_at,destroyed_at) VALUES($1,$2,clock_timestamp(),clock_timestamp())", [sessionId, Buffer.alloc(61)]);
      await supportClient.query(`INSERT INTO support."case"(case_id,token_sha256,session_id,identity_owner_ref,language,created_at,transcript_snapshot_ciphertext,state,shredded_at)
        VALUES($1,$2,$3,$4,'en',clock_timestamp(),$5,'CLOSED',clock_timestamp())`,
      [caseId, createHash("sha256").update(caseId).digest("hex"), sessionId, destroyed.ownerRef, caseCiphertext]);
      await supportClient.query("INSERT INTO support.case_key(case_id,wrapped_key,created_at,destroyed_at) VALUES($1,$2,clock_timestamp(),clock_timestamp())", [caseId, Buffer.alloc(61)]);
      await supportClient.query("INSERT INTO support.shred_audit(at,os_user,target_kind,target_ref,keys_destroyed) VALUES(clock_timestamp(),'fixture','owner',$1,2)", [destroyed.ownerRef]);
      await supportClient.query("COMMIT");
    } catch (error) { await supportClient.query("ROLLBACK"); throw error; }
    finally { supportClient.release(); }
    const sentArchive = await completed(destroyed);
    const archive = entries(await sentArchive.store.read(sentArchive.row.export_id, destroyed.userId));
    const tombstoned = JSON.parse(archive["debates.json"]!).debates.find((debate: { reference: string }) => debate.reference === runId);
    expect(tombstoned).toMatchObject({ reference: runId, content_status: "UNRECOVERABLE" });
    expect(Date.parse(tombstoned.deleted_at)).toBe(tombstonedAt.getTime());
    const support = JSON.parse(archive["support.json"]!);
    expect(support.sessions).toEqual(expect.arrayContaining([expect.objectContaining({ reference: sessionId, content_status: "UNRECOVERABLE", messages: [] })]));
    expect(support.cases).toEqual(expect.arrayContaining([expect.objectContaining({ reference: caseId, content_status: "UNRECOVERABLE", messages: [] })]));
    expect(JSON.stringify(support)).not.toContain(caseCiphertext.toString("base64"));

    const a = await account(), directory = join(root, randomUUID());
    const sealedEmail = encrypt(Buffer.alloc(32, 11), Buffer.from(a.email),
      ["identity", "user.email_ciphertext", a.userId, "run:none", a.userId, `user-dek:${a.userId}`, "1"]);
    await db.pool.query("UPDATE identity.\"user\" SET email_ciphertext=$2::jsonb WHERE user_id=$1", [a.userId, sealedEmail]);
    await db.pool.query("UPDATE identity.channel_binding SET address_ciphertext=$2::jsonb WHERE user_id=$1 AND channel_type='email'", [a.userId, sealedEmail]);
    const f = application(directory, a.email, randomUUID(), undefined, undefined, Buffer.alloc(32, 12));
    await accepted(a, f.app);
    const before = sent.length;
    await f.app.runOnce();
    expect((await f.app.status(a.userId)).status).toBe("FAILED");
    expect(sent).toHaveLength(before);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.data_export.failed'", [a.auditToken])).rows[0].n).toBe(1);

    const wrongAad = await account(), acceptanceId = randomUUID(), recordsKey = Buffer.alloc(32, 9);
    const sealed = sealRecord(recordsKey, { table: "legal.acceptance", column: "evidence_ciphertext", rowId: randomUUID() }, Buffer.from('{"ip":"192.0.2.5"}'));
    await db.pool.query(`INSERT INTO legal.acceptance(acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id)
      VALUES($1,$2,'TERMS','1.0',$3,'en','SIGN_UP',clock_timestamp(),$4,$5)`,
    [acceptanceId, wrongAad.ownerRef, "a".repeat(64), sealed.ciphertext, sealed.keyId]);
    const wrongApp = application(join(root, randomUUID()), wrongAad.email, randomUUID(), undefined, recordsKey);
    await accepted(wrongAad, wrongApp.app);
    const beforeAadMail = sent.length;
    await wrongApp.app.runOnce();
    expect((await wrongApp.app.status(wrongAad.userId)).status).toBe("FAILED");
    expect(sent).toHaveLength(beforeAadMail);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.data_export.failed'", [wrongAad.auditToken])).rows[0].n).toBe(1);
  });

  it("E6 includes all 130 owned debates without a cap", async () => {
    const a = await account(), ids = await seedRuns(a, 130);
    const { store, row } = await completed(a);
    const debates = JSON.parse(entries(await store.read(row.export_id, a.userId))["debates.json"]!).debates;
    expect(debates).toHaveLength(130);
    expect(new Set(debates.map((debate: { reference: string }) => debate.reference))).toEqual(new Set(ids));
  });

  it("E7 repeats identical download bytes and digest after completion", async () => {
    const a = await account(), { app, row } = await completed(a);
    const token = deliveredToken(row.export_id);
    const first = await app.download(a.userId, token, context);
    const second = await app.download(a.userId, token, context);
    expect(first.kind).toBe("OK");
    expect(second).toEqual(first);
    if (first.kind !== "OK") throw Error("download did not succeed");
    expect(createHash("sha256").update(first.bytes).digest("hex")).toBe(row.archive_sha256);
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event WHERE actor_key_ref=$1 AND event_type='identity.data_export.downloaded'", [a.auditToken])).rows[0].n).toBe(2);
    await seedRuns(a, 1);
    const third = await app.download(a.userId, token, context);
    expect(third).toEqual(first);
  });

  it("E8 resumes a claimed export through a fresh application and file store", async () => {
    const a = await account(), directory = join(root, randomUUID()), first = application(directory, a.email);
    await accepted(a, first.app);
    const claim = await first.repo.claim(randomUUID(), 1);
    expect(claim?.userId).toBe(a.userId);
    await db.pool.query("UPDATE identity.data_export SET lease_until=clock_timestamp()-interval '1 second' WHERE export_id=$1", [claim!.exportId]);
    const second = application(directory, a.email);
    await second.app.runOnce();
    expect((await second.app.status(a.userId)).status).toBe("SENT");
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1", [a.userId])).rows[0];
    const third = application(directory, a.email);
    const downloaded = await third.app.download(a.userId, deliveredToken(row.export_id), context);
    expect(downloaded.kind).toBe("OK");
    if (downloaded.kind !== "OK") throw Error("fresh instance did not download");
    expect(downloaded.bytes).toEqual(await second.store.read(row.export_id, a.userId));
  });

  it("E9 expires a link and destroys both persisted files", async () => {
    const a = await account(), { app, row, directory } = await completed(a);
    for (const filename of await readdir(directory)) {
      expect((await readFile(join(directory, filename))).subarray(0, 4).toString("hex")).not.toBe("504b0304");
    }
    const token = deliveredToken(row.export_id);
    const sentAt = new Date(Date.now() - 25 * 60 * 60 * 1_000);
    await db.pool.query("UPDATE identity.data_export SET sent_at=$2,expires_at=$2::timestamptz+interval '86400 seconds' WHERE export_id=$1", [row.export_id, sentAt]);
    await app.runOnce();
    expect((await readdir(directory)).filter(name => name.startsWith(row.export_id))).toHaveLength(0);
    expect((await app.status(a.userId)).status).toBe("NONE");
    expect(await app.download(a.userId, token, context)).toEqual({ kind: "INVALID" });
  });

  it("E10 cancels a queued export when erasure begins", async () => {
    const a = await account(), directory = join(root, randomUUID()), { app, store } = application(directory, a.email);
    await accepted(a, app);
    const preparingId = (await db.pool.query("SELECT export_id FROM identity.data_export WHERE user_id=$1 AND status='PREPARING'", [a.userId])).rows[0].export_id;
    const sentId = randomUUID(), token = randomBytes(32).toString("base64url"), bytes = Buffer.from("seeded encrypted export file");
    const sentAt = new Date();
    await db.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,link_token_hash,
      archive_sha256,archive_bytes,sent_at,expires_at)
      VALUES($1,$2,$3,'en','SENT',$4,$5,$6,$7,$4,$4::timestamptz+interval '86400 seconds')`,
    [sentId, a.userId, a.sessionId, sentAt, hashToken("data-export-link", token),
      createHash("sha256").update(bytes).digest("hex"), bytes.length]);
    await store.write(sentId, a.userId, bytes);
    const beforeMail = sent.length;
    const erasure = await db.pool.query(`INSERT INTO identity.account_erasure_request(user_id,requested_at,execute_at,prepared_at,
      prepared_run_ids,prepared_legacy_run_ids,prepared_published_run_ids,prepared_current_publication_refs,prepared_cleanup_publication_refs)
      VALUES($1,clock_timestamp(),clock_timestamp()+interval '30 days',clock_timestamp(),'{}','{}','{}','{}','{}') RETURNING erasure_id`, [a.userId]);
    await app.runOnce();
    expect((await db.pool.query("SELECT status FROM identity.data_export WHERE export_id=$1", [preparingId])).rows[0].status).toBe("CANCELLED");
    expect(sent).toHaveLength(beforeMail);
    expect(await app.download(a.userId, token, context)).toEqual({ kind: "INVALID" });
    await store.write(sentId, a.userId, bytes);
    expect((await readdir(directory)).filter(name => name.startsWith(sentId))).toHaveLength(2);
    const completedAt = (await db.pool.query("SELECT clock_timestamp() at")).rows[0].at;
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE debateai_erasure_runtime");
      expect((await client.query("SELECT current_user name")).rows[0].name).toBe("debateai_erasure_runtime");
      expect((await client.query("SELECT identity.finalize_account_erasure($1,$2,$2,0,0,0,1) status", [erasure.rows[0].erasure_id, completedAt])).rows[0].status).toBe("COMMITTED");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
    expect((await db.pool.query("SELECT count(*)::int n FROM identity.data_export WHERE user_id=$1", [a.userId])).rows[0].n).toBe(0);
    await app.runOnce();
    expect((await readdir(directory)).filter(name => name.startsWith(sentId))).toHaveLength(0);
  });

  it("E11 mails the verified address with locale, public origin and stable message id", async () => {
    const a = await account("mail-marker@example.test"), recoveryEmail = "recovery-marker@example.test";
    await db.pool.query("UPDATE identity.\"user\" SET recovery_email_ciphertext='{}' WHERE user_id=$1", [a.userId]);
    await db.pool.query("INSERT INTO identity.channel_binding(user_id,channel_type,address_ciphertext,state,created_at,verified_at) VALUES($1,'recovery_email','{}','verified',clock_timestamp(),clock_timestamp())", [a.userId]);
    const f = application(join(root, randomUUID()), a.email, randomUUID(), recoveryEmail);
    expect((await f.app.request({ userId: a.userId, sessionId: a.sessionId, grantToken: a.grantToken, locale: "ro", source: context })).kind).toBe("ACCEPTED");
    await f.app.runOnce();
    const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1", [a.userId])).rows[0];
    expect(row.status).toBe("SENT");
    const message = sent.find(item => item.messageId === row.export_id)!;
    expect(message).toMatchObject({ to: a.email, templateId: "DATA_EXPORT", locale: "ro", messageId: row.export_id });
    expect(message.to).not.toBe(recoveryEmail);
    const rendered = renderMail(message.templateId, message.locale, message.params);
    expect(rendered.subject).toBe("Exportul datelor dumneavoastră este pregătit");
    expect(message.params.downloadUrl).toContain("https://example.test/export#");
    expect(message.attachments).toBeUndefined();
  });

  it("E12 hands off a 20-debate account within sixty seconds", async () => {
    const a = await account();
    await seedRuns(a, 20);
    const start = Date.now();
    await completed(a);
    expect(Date.now() - start).toBeLessThanOrEqual(60_000);
  });

  it("E13 excludes other accounts from the archive", async () => {
    const a = await account("private-A@example.test"), b = await account("private-B@example.test");
    const [otherRun] = await seedRuns(b, 1);
    const { store, row } = await completed(a);
    const archive = JSON.stringify(entries(await store.read(row.export_id, a.userId)));
    expect(archive).toContain(a.email);
    expect(archive).not.toContain(b.email);
    expect(archive).not.toContain(b.userId);
    expect(archive).not.toContain(otherRun);
    expect(archive).not.toContain(`export-fixture-question-${b.userId}-0`);
  });

  it("E14 writes requested, delivered and download audit without logging tokens", async () => {
    const a = await account(), failed = await account();
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(method => vi.spyOn(console, method));
    try {
      const { row, app } = await completed(a);
      const token = deliveredToken(row.export_id);
      expect((await app.download(a.userId, token, context)).kind).toBe("OK");
      expect((await app.download(a.userId, token, context)).kind).toBe("OK");
      const types = (await db.pool.query("SELECT event_type FROM identity.audit_event WHERE actor_key_ref=$1 ORDER BY occurred_at", [a.auditToken])).rows.map(item => item.event_type);
      expect(types).toContain("identity.data_export.requested");
      expect(types).toContain("identity.data_export.delivered");
      expect(types.filter(type => type === "identity.data_export.downloaded")).toHaveLength(2);
      const failedFixture = application(join(root, randomUUID()), failed.email);
      await accepted(failed, failedFixture.app);
      const failedApp = new DataExportApplication({ repository: failedFixture.repo, store: failedFixture.store,
        collect: async () => { throw Error("fixture decrypt failure"); }, archiveCatalog: loadArchiveCatalog,
        mail: { sendExportReady: async () => { throw Error("unexpected mail"); } },
        publicAppUrl: "https://example.test", workerId: randomUUID(), log: line => lines.push(line) });
      await failedApp.runOnce();
      expect((await failedApp.status(failed.userId)).status).toBe("FAILED");
      const failedEvents = (await db.pool.query("SELECT event_type FROM identity.audit_event WHERE actor_key_ref=$1", [failed.auditToken])).rows.map(item => item.event_type);
      expect(failedEvents).toContain("identity.data_export.failed");
      expect((await db.pool.query("SELECT count(*)::int n FROM identity.audit_event AS event WHERE row_to_json(event)::text LIKE $1", [`%${token}%`])).rows[0].n).toBe(0);
      expect(JSON.stringify(lines)).not.toContain(row.link_token_hash);
      expect(JSON.stringify(lines)).not.toContain(token);
      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(token);
        expect(JSON.stringify(spy.mock.calls)).not.toContain(row.link_token_hash);
      }
      expect((await db.pool.query("SELECT count(*)::int n FROM identity.social_flow AS flow WHERE row_to_json(flow)::text LIKE $1", [`%${token}%`])).rows[0].n).toBe(0);
    } finally { for (const spy of spies) spy.mockRestore(); }
  });

  it("E15 (0132, 0133) carries a debate's web sources opened under its key, never a page text or pack, and the investigations and reserve", async () => {
    // The approved privacy rows: search words, links, sites, titles, dates and short quotes are kept with the debate; page
    // text only up to 30 days after the last activity, so the archive names its state (STORED) and never carries it.
    const a = await account(), secretDir = join(root, randomUUID()), contentPool = poolFacade(pools.runtime);
    const seedPool = createPool(db.connectionString);
    try {
      const users = new FileUserDekStore(secretDir, loadKek(generateDek()));
      await users.store(a.userId, generateDek());
      const keys = new FileRunContentKeyStore(secretDir, users, async ownerRef => {
        if (ownerRef !== a.ownerRef) throw Error("WRONG_OWNER");
        return a.userId;
      });
      const cipher = new ContentCipher(keys);
      configureContentEncryption(contentPool, cipher);
      configureContentEncryption(seedPool, cipher);
      const start = (tag: string) => new RunRepository(seedPool).startRun({
        questionLine: `e15-${tag}-question`, askContract: { audience: "data-export-test" },
        principal: { kind: "server", userId: a.userId, ownerRef: a.ownerRef },
        sessionId: a.sessionId, callerScope: "ASKER", asOf: new Date(),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
        tierProvenanceRef: "data-export-test", compositionBudgetTier: "low",
        depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
        strangerSampleRate: 1, envelopeBasis: { source: "data-export-test" },
        registerVersion: 1, batteryVersion: "data-export-test", batteryRows: []
      });
      const runId = await start("root"), dig = await start("dig"), closedRoot = await start("closed");
      const prepared = await cipher.prepareRun(runId);
      const seal = (carrier: ContentCarrier, id: string, value: unknown): WebSealed => {
        const envelope = prepared.encrypt(carrier, id, value);
        return { envelope, attestation: prepared.attestEnvelope(carrier, id, "content_ciphertext", envelope) };
      };
      const web = new PostgresWebEvidenceRepository(seedPool);
      const search = randomUUID(), top = randomUUID(), other = randomUUID(), reading = randomUUID(), extract = randomUUID();
      expect(await web.recordSearch({ runId, searchId: search, pathRef: "pos-1", side: "for", languageKind: "english", language: "en",
        country: null, lookBack: "12m", outcome: "FOUND", chargeMicros: 1000, resultCount: 2,
        words: seal("identity.web_search", search, { words: "e15-search-words" }) })).toBe("RECORDED");
      for (const [page, rank] of [[top, 1], [other, 2]] as const) {
        expect(await web.recordPage({ runId, pageId: page, searchId: search, rank, readDepth: "whole",
          about: seal("identity.web_page", page, { url: `https://example.test/e15-${rank}`, site: "example.test", title: `e15-title-${rank}` }),
          text: { chars: 20, digest: Buffer.alloc(32, rank), sealed: seal("identity.web_page_text", page, { text: `e15-page-text-${rank}` }) } }))
          .toBe("RECORDED");
      }
      expect(await web.recordReading({ runId, readingId: reading, pageId: top, reader: 1, maker: "anthropic", outcome: "READ", grade: 3,
        line: seal("identity.web_reading", reading, { line: "e15-reader-line" }) })).toBe("RECORDED");
      expect(await web.recordExtract({ runId, extractId: extract, pageId: top, label: "S1-1", foundBy: [1],
        quote: seal("identity.web_extract", extract, { quote: "e15-short-quote" }) })).toBe("RECORDED");
      expect(await web.recordPicks(runId, "pos-1", [top])).toBe("RECORDED");
      const pack = randomUUID();
      expect(await web.recordPack({ runId, packId: pack, pathRef: "pos-1", extractLabels: ["S1-1"],
        pack: seal("identity.web_pack", pack, { text: "e15-pack-text" }) })).toBe("RECORDED");
      prepared.close();
      expect(await new PostgresWebResearchedRepository(seedPool).record(a.ownerRef, runId, other)).toBe("RECORDED");
      const investigations = new PostgresInvestigationRepository(seedPool);
      const joined = await investigations.join({ ownerRef: a.ownerRef, parentRunId: runId, childRunId: dig, places: ["pos-1"], mode: "quick" });
      expect(joined.outcome).toBe("JOINED");
      const closed = (await investigations.open(a.ownerRef, closedRoot))!;
      expect(await investigations.recordReserveEvent(a.ownerRef, { kind: "HELD", amountMicros: 200_000 })).toBe("RECORDED");
      expect(await investigations.close(a.ownerRef, closed)).toMatchObject({ outcome: "CLOSED", reportVersion: 1 });
      expect(await investigations.recordReserveEvent(a.ownerRef, { kind: "USED", investigationId: closed, reportVersion: 1 })).toBe("RECORDED");
      const ownerView: OwnerViewPort = {
        runKeyPresent: runId => keys.exists(runId), runRemovedByCheck: async () => false, resolveRunRef: async runId => runId,
        readRun: async () => ({ state: "SETTLED", question_line: "e15 question" }), readRunAnswer: async () => null,
        readAnswer: async () => null, readInspection: async () => null, readLedgerDigest: async () => null, readStory: async () => null,
        readDisclosure: async () => null, readNode: async () => null, readSynthesisChecks: async () => [], readPublicationReviews: async () => []
      };
      const fixture = application(join(root, randomUUID()), a.email, randomUUID(), undefined, undefined, undefined, ownerView,
        runContentOpener(contentPool));
      await accepted(a, fixture.app);
      await fixture.app.runOnce();
      const row = (await db.pool.query("SELECT * FROM identity.data_export WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 1", [a.userId])).rows[0];
      expect(row.status, lines.join("\n")).toBe("SENT");
      const archive = entries(await fixture.store.read(row.export_id, a.userId));
      const sources = JSON.parse(archive["debates.json"]!).web_sources;
      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({ debate_reference: runId, content_status: "READABLE",
        searches: [{ search_id: search, path_ref: "pos-1", outcome: "FOUND", words: { words: "e15-search-words" } }],
        pages: [
          { page_id: top, path_ref: "pos-1", rank: 1, top_rank: 1, read_depth: "whole", text_state: "STORED",
            about: { url: "https://example.test/e15-1", site: "example.test", title: "e15-title-1" } },
          { page_id: other, path_ref: "pos-1", rank: 2, top_rank: null, text_state: "STORED", about: { title: "e15-title-2" } }],
        readings: [{ reading_id: reading, page_id: top, reader: 1, maker: "anthropic", grade: 3, line: { line: "e15-reader-line" } }],
        quotes: [{ extract_id: extract, page_id: top, label: "S1-1", found_by: [1], quote: { quote: "e15-short-quote" } }],
        added_to_researched: [{ page_id: other, path_ref: "pos-1", outcome: null, settled_at: null }] });
      const all = JSON.stringify(archive);
      for (const absent of ["e15-page-text", "e15-pack-text", "charge_micros", "text_digest"]) expect(all, absent).not.toContain(absent);
      const account = JSON.parse(archive["account.json"]!);
      expect(account.investigations).toMatchObject([
        { investigation_id: joined.investigationId, root_debate_reference: runId, state: "open", report_version: 0,
          members: [{ debate_reference: runId, dug_from_reference: null, mode: null },
            { debate_reference: dig, dug_from_reference: runId, places: ["pos-1"], mode: "quick" }], report_versions: [] },
        { investigation_id: closed, root_debate_reference: closedRoot, state: "closed", report_version: 1,
          members: [{ debate_reference: closedRoot, dug_from_reference: null }],
          report_versions: [{ report_version: 1, reopened_at: null, report_reference: null }] }]);
      expect(account.reserve_events).toMatchObject([
        { event_no: 1, kind: "HELD", amount_micros: 200_000, investigation_id: null },
        { event_no: 2, kind: "USED", amount_micros: 200_000, investigation_id: closed, report_version: 1 }]);
    } finally { await seedPool.end(); }
  });
});
