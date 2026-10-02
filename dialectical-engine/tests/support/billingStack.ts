import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { BillingPersonAllowanceSource } from "@debateai/billing-core";
import { PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import {
  createEmailBlindIndex,
  encrypt,
  generateDek,
  hashToken,
  normalizeEmailForBlindIndex,
  sealRecord,
  type AuditContextHasher,
  type KeyDestroyResult,
  type ReadableUserDekStore
} from "@debateai/crypto";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, PostgresEmailChangeRepository,
  RunRepository, migrate
} from "@debateai/db";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import { currentDocument } from "@debateai/legal-manifest";
import { XMoneyClient } from "@debateai/payments-xmoney";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue, type PlanId } from "@debateai/register";
import { buildApi } from "../../apps/api/src/index.js";
import type { BillingConnectors } from "../../apps/api/src/billing/connectors.js";
import { BillingReconciler, type ReconcileReport } from "../../apps/api/src/billing/reconcile.js";
import { createBillingRuntime, type BillingRuntime, type BillingRuntimeDeps } from "../../apps/api/src/billing/runtime.js";
import { StageShiftedXMoneyClient } from "../../apps/api/src/billing/stage-clock.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
import { billingMailAttachmentResolvers } from "../../apps/api/src/mail-attachments.js";
import { EmailChangeService } from "../../apps/api/src/email-change.js";
import { MemoryEmailChangeMailSender, MemoryTemplatedMailSender, type TemplatedMail } from "../../apps/api/src/mail-channel.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import { testBillingPlans, testBillingPolicy, testCountryPolicy, unusedAskApplication } from "./billingFixtures.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "./discoveredPanel.js";
import { startFakeXMoney } from "./fake-xmoney.js";
import { FakeInvoiceIssuer } from "./fake-invoice-issuer.js";
import { FakeTaxEngine } from "./fake-tax-engine.js";
import { TEST_APP_ORIGIN, testSessionHeaders, type TestHttpIdentity } from "./httpSession.js";
import { startTestDatabase, type TestDatabase } from "./testDatabase.js";

/**
 * P23 — the paid-plans runtime exactly as main.ts composes it (P7's createBillingRuntime with every P8–P16 member),
 * over embedded Postgres, the fake xMoney server, FakeTaxEngine and FakeInvoiceIssuer. Accounts are made active
 * directly (the sign-up, verification and 2-step flows are L3's, the age gate's and the existing suites'), each with
 * the age record (0077, unless a test asks for an account that still owes it) and the sign-up TERMS acceptance
 * registration writes; the session application reads that age record as SessionService does. Everything from the
 * quote on goes through the real routes and the real jobs. The
 * runtime's timers are never started: the test drives time. The stack's clock is real time plus whatever the test has
 * advanced, and xMoney is reached through StageShiftedXMoneyClient with that same offset, exactly as a stage host
 * with BILLING_STAGE_CLOCK_OFFSET_DAYS runs: the fake stamps transactions with real time, as xMoney does.
 */

/** TEST-NET-3 addresses the fake country lookup maps; Fastify sees them as request.ip through inject. */
export const TEST_IPS = Object.freeze({ RO: "203.0.113.10", DE: "203.0.113.20", US: "203.0.113.30" } as const);
const COUNTRY_OF_IP: Readonly<Record<string, string>> = Object.freeze({
  [TEST_IPS.RO]: "RO", [TEST_IPS.DE]: "DE", [TEST_IPS.US]: "US"
});
/** A syntactically valid argon2id hash nobody can sign in with; the stack never checks a password. */
const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export type BillingPerson = Readonly<{ email: string; userId: string; ownerRef: string; ip: string; identity: TestHttpIdentity }>;
/** The sign-up TERMS row: the current Terms, an older version (another hash), or none (an account made before the record existed). */
export type AcceptedTerms = "CURRENT" | "OLDER" | "NONE";
/** The age record: PASSED as registration writes it since 0077, or OWED (an account from before the age gate). */
export type AgeRecord = "PASSED" | "OWED";
export type HttpAnswer = Readonly<{ status: number; body: Record<string, unknown>; text: string }>;
export type FakeXMoney = Awaited<ReturnType<typeof startFakeXMoney>>;
export type PaidPlan = Exclude<PlanId, "FREE">;

export interface BillingStack {
  readonly database: TestDatabase;
  readonly runtime: BillingRuntime;
  readonly xmoney: FakeXMoney;
  readonly mail: MemoryTemplatedMailSender;
  readonly invoices: FakeInvoiceIssuer;
  readonly tax: FakeTaxEngine;
  now(): Date;
  advanceDays(days: number): void;
  /**
   * An active account with a live session, as a person has after sign-up (with its age check), email check and 2-step
   * enrolment. `age: "OWED"` leaves out the age record, as for an account made before the age gate.
   */
  signUp(email: string, ipCountry: keyof typeof TEST_IPS, terms?: AcceptedTerms, age?: AgeRecord): Promise<BillingPerson>;
  /**
   * W8 (P2-I12): the account's email change exactly as Settings runs it (turn 14's EmailChangeService over its real
   * repository): a CHANGE_EMAIL step-up grant as the real rotation mints it, the request, then the link opened from the
   * new address. Billing is told nothing; it must follow the account by itself.
   */
  changeEmail(person: BillingPerson, newEmail: string): Promise<void>;
  /** The xMoney order the person's subscription rebills (A1). */
  xmoneyOrderOf(ownerRef: string): Promise<string | null>;
  get(person: BillingPerson | null, url: string, ip?: string): Promise<HttpAnswer>;
  post(person: BillingPerson | null, url: string, payload: unknown, ip?: string): Promise<HttpAnswer>;
  /** The notice as xMoney posts it: form-encoded, no session. */
  notify(opensslResult: string): Promise<HttpAnswer>;
  consents(locale: string): Readonly<Record<"renewal_terms" | "immediate_start", Readonly<{ version: string; sha256: string }>>>;
  /** POST /v1/billing/quote in the person's IP country, with R-15's name, city and county for Romania. */
  quote(person: BillingPerson, planId: PaidPlan): Promise<HttpAnswer>;
  checkout(person: BillingPerson, quoteRef: string): Promise<HttpAnswer>;
  /** The browser half: xMoney's form completes the SIGNED order the checkout returned. */
  pay(checkout: HttpAnswer, cardCountry: string, succeed?: boolean): ReturnType<FakeXMoney["completeSignedOrder"]>;
  /** quote → checkout → pay → notice → every job. Returns the charge ref. */
  subscribe(person: BillingPerson, planId: PaidPlan, cardCountry: string): Promise<string>;
  runJobs(): Promise<number>;
  /** P11a's renewal pass, then P11b's maintenance (the period-end sweep), then every job they queued. */
  runRenewals(): Promise<void>;
  /**
   * P14a's daily money check (A10's listings and A2's adoption) over the stack's xMoney, built from the same members as
   * runtime.ts builds its own (which the runtime does not expose), then every job it queued.
   */
  reconcileDaily(): Promise<ReconcileReport>;
  subscriptionStatus(ownerRef: string): Promise<string | null>;
  cancelRequested(ownerRef: string): Promise<boolean>;
  entitlementPlan(ownerRef: string): Promise<PlanId>;
  spend(person: BillingPerson, chargeMicros: number): Promise<void>;
  mailsTo(email: string): readonly TemplatedMail[];
  /** M9 is sent after the 202 (P13), so a test waits for it. */
  waitForMail(email: string, templateId: TemplatedMail["templateId"]): Promise<TemplatedMail>;
  stop(): Promise<void>;
}

/** The users' DEKs in memory. `load` hands out a copy: DekAccountEmailReader zeroes what it is given. */
class MemoryUserDekStore implements ReadableUserDekStore {
  readonly #deks = new Map<string, Buffer>();
  async store(userId: string, dek: Uint8Array): Promise<void> { this.#deks.set(userId, Buffer.from(dek)); }
  async destroy(userId: string): Promise<KeyDestroyResult> { return this.#deks.delete(userId) ? "DESTROYED" : "ALREADY_ABSENT"; }
  async exists(userId: string): Promise<boolean> { return this.#deks.has(userId); }
  async load(userId: string): Promise<Buffer> {
    const dek = this.#deks.get(userId);
    if (dek === undefined) throw new Error("BILLING_STACK_DEK_MISSING");
    return Buffer.from(dek);
  }
}

const opaqueHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;

function identityFor(userId: string, ownerRef: string, sessionId: string, label: string): TestHttpIdentity {
  const token = (purpose: string): string => createHash("sha256").update(`billing-stack:${label}:${purpose}`, "utf8").digest("base64url");
  const hash = (value: string): string => `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
  const rawSessionToken = token("session");
  const rawCsrfToken = token("csrf");
  return Object.freeze({
    rawSessionToken,
    rawCsrfToken,
    authenticated: Object.freeze({
      session: Object.freeze({
        asker_id: `owner:${ownerRef}`, session_id: sessionId, caller_scope: "ASKER" as const,
        ownership_provenance: "server_session" as const, provisional_identity_model: false as const
      }),
      userId, ownerRef, tokenHash: hash(rawSessionToken), csrfTokenHash: hash(rawCsrfToken), authKind: "cookie" as const
    })
  });
}

/**
 * An active account the way registration stores it (the email under the user's DEK, with registration's AAD,
 * apps/api/src/registration.ts:1271-1273; the blind index P13 looks up; the passed age record 0077's
 * identity.record_registration_age_check writes, with the connection's country, recorded and never decisive, R3-3),
 * plus one live session row, which P12a's `billing.consume_withdrawal_grant` requires. The same columns as P12a's own
 * grant test.
 */
async function createActiveAccount(
  pool: Pool, deks: MemoryUserDekStore, blindIndexKey: Buffer, email: string, countryCode: string, at: Date, age: AgeRecord
) {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const dek = generateDek();
  const emailCiphertext = encrypt(dek, Buffer.from(email, "utf8"), [
    "identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"
  ]);
  await deks.store(userId, dek);
  dek.fill(0);
  await pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,$3::jsonb,'{}',NULL,$4,$5,$6,$7,'active',$8,$8)
  `, [
    userId, createEmailBlindIndex(blindIndexKey, normalizeEmailForBlindIndex(email)), JSON.stringify(emailCiphertext),
    PASSWORD_HASH, `billing-stack-${randomUUID()}`, randomUUID(), ownerRef, at
  ]);
  // The row registration writes inside its own transaction since the age gate (0077). The database function insists
  // on a pending account, so the stack, which creates the account active, writes the same row directly. An OWED
  // account has none, like one made before the age gate: 0077's read_age_check_outcome then answers 'required'.
  if (age === "PASSED") {
    await pool.query(`
      INSERT INTO identity.age_check(user_id,outcome,min_age_applied,country_code,rule_version,context,checked_at)
      VALUES ($1,'passed',$2,$3,$4,'registration',$5)
    `, [userId, MIN_AGE, countryCode, AGE_RULE_VERSION, at]);
  }
  await pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,jsonb_build_object('user_agent_hash',$5::text),clock_timestamp(),
      clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp(),NULL)
  `, [sessionId, userId, opaqueHash(), opaqueHash(), opaqueHash()]);
  return Object.freeze({ userId, ownerRef, sessionId });
}

export async function startBillingStack(): Promise<BillingStack> {
  const database = await startTestDatabase();
  await migrate(database.pool);
  const xmoney = await startFakeXMoney();
  const tax = new FakeTaxEngine();
  const invoices = new FakeInvoiceIssuer();
  const mail = new MemoryTemplatedMailSender();
  const deks = new MemoryUserDekStore();
  const recordsKey = randomBytes(32);
  const blindIndexKey = randomBytes(32);
  // Real time plus what the test advanced: time moves on by itself, as on a stage host with an offset.
  let advancedMs = 0;
  const now = (): Date => new Date(Date.now() + advancedMs);
  const acceptances = new AcceptanceRepository(database.pool);

  // Turn 14's change-email service on the stack's own database, DEKs and blind-index key. Its mail is kept apart from
  // billing's, so a test reads the confirmation link from here.
  const emailChangeMail = new MemoryEmailChangeMailSender();
  const emailChanges = new EmailChangeService({
    repository: new PostgresEmailChangeRepository(database.pool, Object.freeze({
      hashSourceIp: async () => "33".repeat(32),
      hashUserAgent: async () => "44".repeat(32)
    }) as unknown as AuditContextHasher),
    // Real time, not the stack's: the database bounds a link's expiry by its own clock.
    users: deks, blindIndexKey, mail: emailChangeMail, tokenTtlMs: 24 * 3_600_000, resendCooldownMs: 60_000
  });
  const emailChangeSource = Object.freeze({ ip: TEST_IPS.RO, userAgent: "billing-stack", requestId: "request:w8" });

  const identities: TestHttpIdentity[] = [];
  const byToken = (presented: string) => identities.find((identity) => identity.rawSessionToken === presented);
  const sessions: SessionApplication = {
    authenticate: async (presented) => byToken(presented)?.authenticated ?? null,
    verifyCsrf: (authenticated, supplied) => identities.some(
      (identity) => identity.authenticated === authenticated && identity.rawCsrfToken === supplied
    ),
    beginLogin: async () => ({ status: "mfa_required" as const, challengeToken: "c".repeat(43) }),
    completeLogin: async () => { throw new Error("BILLING_STACK_LOGIN_UNUSED"); },
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => identities.length,
    // The age gate's reader (0077), which P8c's checkout guard asks (R3-2) and which is optional on SessionApplication:
    // without it the checkout answers 503 AGE_CHECK_UNAVAILABLE. It reads the account's real record through 0077's
    // own function and answers as SessionService.readAgeConfirmation does (apps/api/src/sessions.ts:549-552).
    readAgeConfirmation: async (session) => {
      const found = await database.pool.query<{ outcome: string }>(
        "SELECT identity.read_age_check_outcome($1) AS outcome", [session.userId]
      );
      return found.rows[0]?.outcome === "required" ? "required" : "confirmed";
    },
    // The password and code checks are the real SessionService's (P12a's suites). The stack mints the grant row the
    // real rotation mints, so P12d's withdrawal consumes it through billing.consume_withdrawal_grant unchanged.
    stepUp: async (input) => {
      const identity = identities.find((candidate) => candidate.authenticated === input.session);
      if (identity === undefined) throw new Error("BILLING_STACK_SESSION_UNKNOWN");
      const grantToken = randomBytes(32).toString("base64url");
      if (input.authorization?.action === "WITHDRAW_SUBSCRIPTION") {
        await database.pool.query(`
          INSERT INTO identity.step_up_grant(
            step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
          ) VALUES ($1,$2,$3,$4,'WITHDRAW_SUBSCRIPTION',NULL,$4,clock_timestamp()-interval '1 second',
            clock_timestamp()+interval '2 minutes')
        `, [randomUUID(), hashToken("step-up-grant", grantToken), identity.authenticated.session.session_id, identity.authenticated.userId]);
      }
      return {
        sessionToken: identity.rawSessionToken, csrfToken: identity.rawCsrfToken, grantToken,
        grantExpiresAt: new Date(Date.now() + 120_000)
      };
    }
  };

  const connectors: BillingConnectors = Object.freeze({
    // As main.ts does under a stage offset: the runtime's own times, translated at xMoney's door.
    xmoney: new StageShiftedXMoneyClient(
      new XMoneyClient({ baseUrl: xmoney.baseUrl, privateKey: xmoney.privateKey, siteId: xmoney.siteId, timeoutMs: 5_000 }),
      () => advancedMs
    ),
    xmoneyEnvironment: "stage",
    tax,
    invoiceRo: invoices,
    recordsKey,
    xmoneyPrivateKey: xmoney.privateKey,
    xmoneyPublicKey: xmoney.publicKey,
    siteId: xmoney.siteId,
    ownerReportEmail: "owner@example.test",
    publicAppUrl: TEST_APP_ORIGIN
  });
  const geo: BillingRuntimeDeps["geo"] = Object.freeze({
    lookup: (ip: string) => ({ country: COUNTRY_OF_IP[ip] ?? "XX", tor: false }),
    close: () => undefined
  });
  const spendStore = new PostgresModelSpendStore(database.pool);
  const billingRepository = new BillingRepository(database.pool);
  const entitlements = new EntitlementRepository(database.pool);
  const reconciler = new BillingReconciler({
    billing: billingRepository, jobs: new BillingJobQueries(database.pool), xmoney: connectors.xmoney,
    environment: connectors.xmoneyEnvironment, audit: () => undefined, clock: now, kick: () => undefined
  });
  const runtime = createBillingRuntime({
    pool: database.pool,
    connectors,
    policy: testBillingPolicy,
    plans: testBillingPlans,
    countryPolicy: testCountryPolicy,
    geo,
    dekStore: deks,
    // R-7 / A22: no publicAppUrl here. The one source of the public origin is `connectors.publicAppUrl` above (the
    // origin of PUBLIC_APP_URL); every link billing builds (backUrl, M9, the emails) is made from it.
    mail: { sender: mail, attachments: billingMailAttachmentResolvers() },
    // P8a's legal gate is L4's `requiresReacceptance`. The stack's accounts are made active directly: they hold no
    // PRIVACY_SHOWN row and at most one TERMS row (an older one, or none, on purpose for M1's attachment cases). In
    // hosted mode L4 owes a document to any account without its record (`owedWithoutRecord`, D1), so it would send
    // them to the accept screen and the billing gate would refuse them. L4's own suites own that rule.
    legal: { requiresReacceptance: async () => false },
    audit: () => undefined,
    clock: now,
    reportPending: () => undefined,
    ownerSpend: spendStore,
    blindIndexKey,
    identities: {
      async ownerRefByEmailBlindIndex(emailBlindIndex: Buffer): Promise<string | null> {
        // Only an active account: an `age_frozen` one (0077), like any other non-active state, gets no cancel link.
        const found = await database.pool.query<{ owner_ref: string }>(
          `SELECT owner_ref::text AS owner_ref FROM identity."user" WHERE email_blind_index = $1 AND state = 'active'`,
          [emailBlindIndex]
        );
        return found.rows[0]?.owner_ref ?? null;
      }
    },
    taxAuthorities: taxAuthoritiesFromValue(
      TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.sourceRef
    )
  });
  // B7a's usage read, composed as main.ts composes it beside the runtime's routes (R-3).
  const usage = new PersonUsageReader({
    entitlements,
    allowance: new BillingPersonAllowanceSource({ entitlements, plans: testBillingPlans, closeBasisPoints: 9_500 }),
    spend: spendStore
  });
  const api: FastifyInstance = buildApi({
    application: unusedAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN,
    billing: { ...runtime.routes, usage }
  });
  await api.ready();

  const answer = (response: { statusCode: number; body: string }): HttpAnswer => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(response.body) as Record<string, unknown>; } catch { body = {}; }
    return Object.freeze({ status: response.statusCode, body, text: response.body });
  };
  const headersFor = (person: BillingPerson | null, mutating: boolean): Record<string, string> =>
    person === null ? (mutating ? { origin: TEST_APP_ORIGIN } : {}) : { ...testSessionHeaders(person.identity, mutating) };

  const stack: BillingStack = {
    database, runtime, xmoney, mail, invoices, tax,
    now,
    advanceDays(days) { advancedMs += days * 86_400_000; },

    async signUp(email, ipCountry, terms = "CURRENT", age = "PASSED") {
      const account = await createActiveAccount(database.pool, deks, blindIndexKey, email, ipCountry, now(), age);
      if (terms !== "NONE") {
        // The row registration writes at sign-up (L3a), in English, as the stack's checkout locale is.
        const current = currentDocument("TERMS", "en")!;
        const acceptanceId = randomUUID();
        const sealed = sealRecord(recordsKey, {
          table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId
        }, Buffer.from("{}", "utf8"));
        await acceptances.recordAll([{
          acceptanceId, ownerRef: account.ownerRef, kind: "TERMS",
          documentVersion: terms === "CURRENT" ? current.version : "0.9",
          documentSha256: terms === "CURRENT" ? current.sha256 : "0".repeat(64),
          locale: "en", surface: "SIGN_UP", acceptedAt: now(),
          evidenceCiphertext: sealed.ciphertext, keyId: sealed.keyId
        }]);
      }
      const identity = identityFor(account.userId, account.ownerRef, account.sessionId, email);
      identities.push(identity);
      return Object.freeze({ email, userId: account.userId, ownerRef: account.ownerRef, ip: TEST_IPS[ipCountry], identity });
    },
    async changeEmail(person, newEmail) {
      const grantToken = randomBytes(32).toString("base64url");
      await database.pool.query(`
        INSERT INTO identity.step_up_grant(
          step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
        ) VALUES ($1,$2,$3,$4,'CHANGE_EMAIL',NULL,$4,clock_timestamp()-interval '1 second',
          clock_timestamp()+interval '2 minutes')
      `, [randomUUID(), hashToken("step-up-grant", grantToken), person.identity.authenticated.session.session_id, person.userId]);
      const session = { userId: person.userId, sessionId: person.identity.authenticated.session.session_id };
      await emailChanges.request(session, { newEmail, grantToken }, emailChangeSource);
      const link = [...emailChangeMail.messages].reverse().find((message) => message.kind === "confirmation");
      if (link === undefined || link.kind !== "confirmation") throw new Error("BILLING_STACK_EMAIL_CHANGE_NOT_SENT");
      await emailChanges.confirm(link.token, emailChangeSource);
    },
    async xmoneyOrderOf(ownerRef) {
      return (await billingRepository.subscriptionForOwner(ownerRef))?.xmoneyOrderId ?? null;
    },

    async get(person, url, ip) {
      return answer(await api.inject({ method: "GET", url, remoteAddress: ip ?? person?.ip ?? TEST_IPS.RO, headers: headersFor(person, false) }));
    },
    async post(person, url, payload, ip) {
      return answer(await api.inject({ method: "POST", url, remoteAddress: ip ?? person?.ip ?? TEST_IPS.RO, headers: headersFor(person, true), payload: payload as Record<string, unknown> }));
    },
    async notify(opensslResult) {
      return answer(await api.inject({
        method: "POST", url: "/v1/billing/xmoney/notify", remoteAddress: "198.51.100.20",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: `opensslResult=${encodeURIComponent(opensslResult)}`
      }));
    },

    consents(locale) {
      const renewal = currentDocument("CONSENT_RENEWAL", locale)!;
      const immediate = currentDocument("CONSENT_IMMEDIATE_START", locale)!;
      return Object.freeze({
        renewal_terms: { version: renewal.version, sha256: renewal.sha256 },
        immediate_start: { version: immediate.version, sha256: immediate.sha256 }
      });
    },

    async quote(person, planId) {
      const country = COUNTRY_OF_IP[person.ip]!;
      return stack.post(person, "/v1/billing/quote", country === "RO"
        ? { plan_id: planId, country, name: "Ana Pop", city: "Cluj-Napoca", region: "Cluj" }
        : { plan_id: planId, country });
    },
    async checkout(person, quoteRef) {
      return stack.post(person, "/v1/billing/checkout", { quote_ref: quoteRef, locale: "en", consents: stack.consents("en") });
    },
    async pay(checkout, cardCountry, succeed = true) {
      return xmoney.completeSignedOrder({
        orderPayload: String(checkout.body.order_payload), orderChecksum: String(checkout.body.order_checksum), cardCountry, succeed
      });
    },

    async subscribe(person, planId, cardCountry) {
      const quote = await stack.quote(person, planId);
      if (quote.status !== 200) throw new Error(`BILLING_STACK_QUOTE_${quote.status}_${String(quote.body.error)}`);
      const checkout = await stack.checkout(person, String(quote.body.quote_ref));
      if (checkout.status !== 200) throw new Error(`BILLING_STACK_CHECKOUT_${checkout.status}_${String(checkout.body.error)}`);
      const notice = await stack.pay(checkout, cardCountry);
      const notified = await stack.notify(notice.opensslResult);
      if (notified.status !== 200 || notified.text !== "OK") throw new Error("BILLING_STACK_NOTICE_REFUSED");
      await stack.runJobs();
      return String(checkout.body.charge_ref);
    },

    // The notice route kicks the worker in the background (P9a), so "done" is: no job due now is still open,
    // whoever claimed it. Retries scheduled for later are not due, and wait for the clock.
    async runJobs() {
      for (let round = 1; round <= 200; round += 1) {
        await runtime.outbox.runOnce();
        const open = await database.pool.query<{ open: string }>(
          `SELECT count(*)::text AS open FROM billing.outbox
           WHERE done_at IS NULL AND dead_at IS NULL AND not_before <= $1`, [now()]
        );
        if (open.rows[0]?.open === "0") return round;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error("BILLING_STACK_JOBS_DID_NOT_SETTLE");
    },
    async runRenewals() {
      await runtime.renewal.runOnce();
      await runtime.maintenance.runOnce();
      await stack.runJobs();
    },
    async reconcileDaily() {
      // The client sends the listing window to whole seconds (P3b), so a transaction xMoney made in this very second is
      // listed only from the next one: the stack lets that second end first, as a daily pass always has.
      await new Promise((resolve) => setTimeout(resolve, 1_000 - (Date.now() % 1_000) + 5));
      const report = await reconciler.runDaily(now());
      await stack.runJobs();
      return report;
    },

    async subscriptionStatus(ownerRef) {
      return (await billingRepository.subscriptionForOwner(ownerRef))?.status ?? null;
    },
    async cancelRequested(ownerRef) {
      return (await billingRepository.subscriptionForOwner(ownerRef))?.cancelRequested ?? false;
    },
    async entitlementPlan(ownerRef) {
      return (await entitlements.current(ownerRef, now())).planId;
    },

    async spend(person, chargeMicros) {
      const runId = await new RunRepository(database.pool).startRun({
        questionLine: "Is this spend attributed to its owner?",
        principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
        sessionId: randomUUID(), callerScope: "ASKER", asOf: now(),
        askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
        compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
        strangerSampleRate: 0, envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1,
        batteryVersion: "test", askContract: {}, batteryRows: []
      });
      const entitlement = await entitlements.current(person.ownerRef, now());
      const client = await database.pool.connect();
      try {
        await entitlements.recordRunChargeScope(client, {
          runId, ownerRef: person.ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt: now()
        });
      } finally {
        client.release();
      }
      // recorded_at is the STACK's clock, not the database's: later cases run with the clock moved forward, and a
      // charge must land inside the person's window at that moved time. The ledger is append-only; an INSERT with
      // an explicit recorded_at is allowed.
      await database.pool.query(
        `INSERT INTO ledger.model_spend
           (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, spend_phase, recorded_at)
         VALUES ($1, 'RUN', $2, 'provider-1', $3::date, $4, 1, 1, 'BODY', $5)`,
        [randomUUID(), runId, costEnvelopeDay(now()), chargeMicros, now()]
      );
    },

    mailsTo(email) {
      return mail.messages.filter((message) => message.mail.to === email).map((message) => message.mail);
    },
    async waitForMail(email, templateId) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = stack.mailsTo(email).find((sent) => sent.templateId === templateId);
        if (found !== undefined) return found;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`BILLING_STACK_MAIL_${templateId}_NOT_SENT`);
    },

    async stop() {
      runtime.stop();
      await api.close();
      await xmoney.stop();
      await database.stop();
    }
  };
  return stack;
}
