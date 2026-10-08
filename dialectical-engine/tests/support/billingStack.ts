import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { BillingPersonAllowanceSource, foldSubscription } from "@debateai/billing-core";
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
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, PostgresAccountErasureRepository,
  PostgresEmailChangeRepository, RunRepository, migrate, type PrivateRunErasureCoordinator
} from "@debateai/db";
import { AGE_RULE_VERSION, MIN_AGE } from "@debateai/kernel";
import { currentDocument } from "@debateai/legal-manifest";
import { createNetopiaPayments, iso2ToNetopiaCountry, loadTrustedKeys } from "@debateai/payments-netopia";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue, type PlanId } from "@debateai/register";
import { PostgresAccountErasureApplication } from "../../apps/api/src/account-erasure.js";
import { buildApi } from "../../apps/api/src/index.js";
import type { BillingConnectors } from "../../apps/api/src/billing/connectors.js";
import { NETOPIA_NOTIFY_PATH } from "../../apps/api/src/billing/index.js";
import { OwnerJobs } from "../../apps/api/src/billing/owner-jobs.js";
import { BillingReconciler, type ReconcileReport } from "../../apps/api/src/billing/reconcile.js";
import { runBillingRefundDoneCli, type RefundDoneArguments } from "../../apps/api/src/billing/refund-done-cli.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { createBillingRuntime, type BillingRuntime, type BillingRuntimeDeps } from "../../apps/api/src/billing/runtime.js";
import { PersonUsageReader } from "../../apps/api/src/billing/usage.js";
import { billingMailAttachmentResolvers } from "../../apps/api/src/mail-attachments.js";
import { EmailChangeService } from "../../apps/api/src/email-change.js";
import { MemoryEmailChangeMailSender, MemoryTemplatedMailSender, type TemplatedMail } from "../../apps/api/src/mail-channel.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import { eraseBillingTestAccount } from "./billingAccountFixture.js";
import { testBillingPlans, testBillingPolicy, testCountryPolicy, unusedAskApplication } from "./billingFixtures.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "./discoveredPanel.js";
import { FakeInvoiceIssuer } from "./fake-invoice-issuer.js";
import { startFakeNetopia, type FakeNetopia, type FakeNetopiaDelivery, type FakeNetopiaOutcome } from "./fake-netopia.js";
import { FakeTaxEngine } from "./fake-tax-engine.js";
import { TEST_APP_ORIGIN, testSessionHeaders, type TestHttpIdentity } from "./httpSession.js";
import { startTestDatabase, type TestDatabase } from "./testDatabase.js";

/**
 * P23, on NETOPIA (spec 2026-10-05 §2.20.2) — the paid-plans runtime exactly as main.ts composes it (createBillingRuntime
 * with every member), over embedded Postgres, N5's NETOPIA protocol fake, FakeTaxEngine and FakeInvoiceIssuer. Accounts
 * are made active directly (the sign-up, verification and 2-step flows are L3's, the age gate's and the existing suites'),
 * each with the age record (0077, unless a test asks for an account that still owes it) and the sign-up TERMS acceptance
 * registration writes. Everything from the quote on goes through the real routes and the real jobs: the checkout starts
 * a hosted payment with the real NETOPIA client, the test pays it on the fake's page, and the fake posts its signed
 * message to the real notify route through a loopback relay (NETOPIA posts to PUBLIC_APP_URL, which the stack never
 * serves). The account deletion routes (DELETE /v1/account) are composed with billing's hook as main.ts composes them
 * (P2-M39). The runtime's timers are never started: the test drives time. The stack's clock is real time plus whatever
 * the test has advanced, and the fake reads the same clock, so every time NETOPIA reports is on the runtime's clock;
 * TimeShiftedCardPayments, which a sandbox host with BILLING_STAGE_CLOCK_OFFSET_DAYS uses, is N1's unit suite's.
 */

/** TEST-NET-3 addresses the fake country lookup maps; Fastify sees them as request.ip through inject. */
export const TEST_IPS = Object.freeze({ RO: "203.0.113.10", DE: "203.0.113.20", US: "203.0.113.30" } as const);
const COUNTRY_OF_IP: Readonly<Record<string, string>> = Object.freeze({
  [TEST_IPS.RO]: "RO", [TEST_IPS.DE]: "DE", [TEST_IPS.US]: "US"
});
/** NETOPIA's numeric issuer country for an ISO alpha-2 code (the fake's `pay` takes NETOPIA's form). */
export function netopiaCountry(iso2: string): number {
  const found = iso2ToNetopiaCountry(iso2);
  if (found === null) throw new Error(`BILLING_STACK_COUNTRY_UNKNOWN:${iso2}`);
  return found.numeric;
}

/** The payer each test country checks out as: every field NETOPIA needs (spec §2.6.1); R-15's city and county for Romania. */
const PAYER_OF: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  RO: { first_name: "Ana", last_name: "Pop", phone: "+40712345678", street: "Strada Memorandumului 1", city: "Cluj-Napoca", region: "Cluj", postal_code: "400114" },
  DE: { first_name: "Anna", last_name: "Schmidt", phone: "+4915112345678", street: "Invalidenstrasse 1", city: "Berlin", postal_code: "10115" },
  US: { first_name: "Ann", last_name: "Smith", phone: "+12125550123", street: "1 Main Street", city: "New York", region: "NY", postal_code: "10001" }
});
/** A syntactically valid argon2id hash nobody can sign in with; the stack never checks a password. */
const PASSWORD_HASH = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export type BillingPerson = Readonly<{ email: string; userId: string; ownerRef: string; ip: string; identity: TestHttpIdentity }>;
/** The sign-up TERMS row: the current Terms, an older version (another hash), or none (an account made before the record existed). */
export type AcceptedTerms = "CURRENT" | "OLDER" | "NONE";
/** The age record: PASSED as registration writes it since 0077, or OWED (an account from before the age gate). */
export type AgeRecord = "PASSED" | "OWED";
export type HttpAnswer = Readonly<{ status: number; body: Record<string, unknown>; text: string }>;
export type PaidPlan = Exclude<PlanId, "FREE">;

export interface BillingStack {
  readonly database: TestDatabase;
  readonly runtime: BillingRuntime;
  readonly netopia: FakeNetopia;
  /** The loopback address the fake posts NETOPIA's messages to (the relay in front of the notify route). */
  readonly notifyUrl: string;
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
  /** The saved card the person's subscription renews with (spec §2.15.2), or null. */
  cardTokenOf(ownerRef: string): Promise<string | null>;
  get(person: BillingPerson | null, url: string, ip?: string): Promise<HttpAnswer>;
  post(person: BillingPerson | null, url: string, payload: unknown, ip?: string): Promise<HttpAnswer>;
  delete(person: BillingPerson, url: string, payload: unknown): Promise<HttpAnswer>;
  /**
   * P2-M39: the verified email address registration's email check leaves on the account (the stack makes accounts
   * active directly, without one). Scheduling an account deletion (DELETE /v1/account, 0040) refuses an account with no
   * address to tell; nothing else in the stack reads it.
   */
  addEmailChannel(person: BillingPerson): Promise<void>;
  /**
   * P2-M39: the scheduled account deletion runs, as the erasure worker runs it once its week has passed (the request's
   * time moved to now, on the database's clock, which the stack does not move): prepare, the completion notice
   * acknowledged, finalize as the erasure principal. Returns finalize's outcome ("COMMITTED").
   */
  commitErasure(person: BillingPerson): Promise<string>;
  /** NETOPIA's message as it arrives at the notify route: the exact bytes and the Verification-token header, no session. */
  notify(input: Readonly<{ rawBody: Buffer; header: string | undefined; contentType?: string }>): Promise<HttpAnswer>;
  /** Every message the fake has queued, posted to the notify route through the relay, as NETOPIA posts them. */
  deliverNotices(): Promise<ReadonlyArray<FakeNetopiaDelivery>>;
  consents(locale: string): Readonly<Record<"renewal_terms" | "immediate_start", Readonly<{ version: string; sha256: string }>>>;
  /** POST /v1/billing/quote in the person's IP country, with R-15's name, city and county for Romania. */
  quote(person: BillingPerson, planId: PaidPlan): Promise<HttpAnswer>;
  checkout(person: BillingPerson, quoteRef: string): Promise<HttpAnswer>;
  /** The browser half: the person completes NETOPIA's page for the checkout's charge, then its message is delivered. */
  pay(checkout: HttpAnswer, cardCountry: string, outcome?: FakeNetopiaOutcome): Promise<ReadonlyArray<FakeNetopiaDelivery>>;
  /** quote → checkout → NETOPIA's page → the message → every job. Returns the charge ref. */
  subscribe(person: BillingPerson, planId: PaidPlan, cardCountry: string): Promise<string>;
  runJobs(): Promise<number>;
  /** P11a's renewal pass, then P11b's maintenance (the period-end sweep), then every job they queued. */
  runRenewals(): Promise<void>;
  /**
   * The reconciler's 10-minute tick as the runtime runs it (spec §2.14: the status reads that are due, newest due
   * first), built from the same members runtime.ts builds its own from, then every job it queued.
   */
  reconcile(): Promise<ReconcileReport>;
  /** The owner's `pnpm billing:refund-done --charge … --amount … --confirm` (spec §2.12.2), then every job. Its output. */
  refundDone(chargeRef: string, amount: string): Promise<string>;
  /**
   * P2-M39: P16c's daily owner-jobs tick (the quarter's tax summary queued once), built from the same members as
   * runtime.ts builds its own (which the runtime does not expose), then every job due; the runtime's own
   * OWNER_TAX_SUMMARY handler renders O1. Returns how many summary jobs the tick queued.
   */
  runOwnerJobs(): Promise<number>;
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
  const tax = new FakeTaxEngine();
  const invoices = new FakeInvoiceIssuer();
  const mail = new MemoryTemplatedMailSender();
  const deks = new MemoryUserDekStore();
  const recordsKey = randomBytes(32);
  const blindIndexKey = randomBytes(32);
  // Real time plus what the test advanced: time moves on by itself, as on a stage host with an offset.
  let advancedMs = 0;
  const now = (): Date => new Date(Date.now() + advancedMs);
  const netopia = await startFakeNetopia({ now });
  const payments = createNetopiaPayments(
    { baseUrl: netopia.baseUrl, apiKey: netopia.apiKey, posSignature: netopia.posSignature }, { now }
  );
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
  // P2-M39: the account deletion routes exactly as main.ts composes them (PostgresAccountErasureApplication over its
  // repository), with billing's hook beside them (`billingErasure` below). Deleting a private debate is not a billing
  // journey: the stack never calls it, so its coordinator is left out.
  const accountErasure = new PostgresAccountErasureApplication(
    new PostgresAccountErasureRepository(database.pool, Object.freeze({
      hashSourceIp: async () => "55".repeat(32),
      hashUserAgent: async () => "66".repeat(32)
    }) as unknown as AuditContextHasher),
    Object.freeze({}) as unknown as PrivateRunErasureCoordinator
  );

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
      const action = input.authorization?.action;
      // The account-scoped grants: P12d's withdrawal, and (P2-M39) the account deletion 0040's schedule consumes.
      if (action === "WITHDRAW_SUBSCRIPTION" || action === "DELETE_ACCOUNT") {
        await database.pool.query(`
          INSERT INTO identity.step_up_grant(
            step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
          ) VALUES ($1,$2,$3,$4,$5,NULL,$4,clock_timestamp()-interval '1 second',
            clock_timestamp()+interval '2 minutes')
        `, [
          randomUUID(), hashToken("step-up-grant", grantToken), identity.authenticated.session.session_id,
          identity.authenticated.userId, action
        ]);
      }
      return {
        sessionToken: identity.rawSessionToken, csrfToken: identity.rawCsrfToken, grantToken,
        grantExpiresAt: new Date(Date.now() + 120_000)
      };
    }
  };

  /** Until N23 removes them from BillingConnectors: the inert xMoney members main.ts builds when api.env names none (N8). */
  const noXMoney = async (): Promise<never> => { throw new Error("BILLING_STACK_HAS_NO_XMONEY"); };
  const connectors: BillingConnectors = Object.freeze({
    payments,
    noticeTrust: Object.freeze({ posSignature: netopia.posSignature, keys: loadTrustedKeys(netopia.trustedKeysPem) }),
    paymentEnvironment: "sandbox",
    xmoney: Object.freeze({
      getTransaction: noXMoney, getOrder: noXMoney, getCard: noXMoney, refund: noXMoney, listTransactions: noXMoney,
      rebill: noXMoney, createCustomer: noXMoney
    }) as unknown as BillingConnectors["xmoney"],
    xmoneyEnvironment: "stage",
    xmoneyPrivateKey: randomBytes(32),
    xmoneyPublicKey: "xmoney-not-configured",
    siteId: "0",
    tax,
    invoiceRo: invoices,
    recordsKey,
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
  // runtime.ts's own `new BillingReconciler({...})`, over the stack's members.
  const reconcilerJobs = new BillingJobQueries(database.pool);
  const reconciler = new BillingReconciler({
    billing: billingRepository, jobs: reconcilerJobs, xmoney: connectors.xmoney, environment: connectors.xmoneyEnvironment,
    audit: () => undefined, clock: now, kick: () => undefined,
    netopia: { payments: connectors.payments, paymentEnvironment: connectors.paymentEnvironment, jobs: reconcilerJobs, pool: database.pool }
  });
  const taxAuthorities = taxAuthoritiesFromValue(
    TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.sourceRef
  );
  const ownerJobs = new OwnerJobs({
    billing: billingRepository, jobs: new BillingJobQueries(database.pool), taxAuthorities, audit: () => undefined, clock: now
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
    taxAuthorities
  });
  // B7a's usage read, composed as main.ts composes it beside the runtime's routes (R-3).
  const usage = new PersonUsageReader({
    entitlements,
    allowance: new BillingPersonAllowanceSource({ entitlements, plans: testBillingPlans, closeBasisPoints: 9_500 }),
    spend: spendStore
  });
  const api: FastifyInstance = buildApi({
    application: unusedAskApplication(), sessions, allowedOrigin: TEST_APP_ORIGIN,
    billing: { ...runtime.routes, usage },
    // As main.ts passes them: the deletion routes, and billing's renewal stop on a scheduled deletion (P15, W7).
    accountErasure, billingErasure: runtime.erasure
  });
  await api.ready();

  // The owner command's desk (refund-done-cli.ts's entry block), over the stack's database and clock.
  const notHere = async (): Promise<never> => { throw new Error("BILLING_STACK_OWNER_COMMAND_CALLS_NOTHING"); };
  const ownerJobQueries = new BillingJobQueries(database.pool);
  const ownerDesk = new RefundDesk({
    repository: billingRepository, jobs: ownerJobQueries,
    xmoney: Object.freeze({ refund: notHere, getTransaction: notHere, listTransactions: notHere }) as never,
    policy: testBillingPolicy, audit: () => undefined, clock: now, xmoneyEnvironment: "stage",
    netopia: { payments: { status: notHere }, paymentEnvironment: "sandbox", jobs: ownerJobQueries }
  });

  // NETOPIA posts its message to PUBLIC_APP_URL/api/v1/billing/netopia/notify, which the stack never serves: the fake
  // posts to this loopback relay, which hands the exact bytes and the header to the notify route. `stack` is read only
  // when a message arrives, after startBillingStack has built it.
  const relay: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => { chunks.push(chunk); });
    request.on("end", () => {
      const header = request.headers["verification-token"];
      const contentType = request.headers["content-type"];
      void stack.notify({
        rawBody: Buffer.concat(chunks), header: typeof header === "string" ? header : undefined,
        ...(contentType === undefined ? {} : { contentType })
      }).then((answered) => {
        response.writeHead(answered.status, { "content-type": "application/json" }).end(answered.text);
      }, () => { response.writeHead(500).end(); });
    });
  });
  await new Promise<void>((resolve) => { relay.listen(0, "127.0.0.1", () => resolve()); });
  const notifyUrl = `http://127.0.0.1:${(relay.address() as AddressInfo).port}${NETOPIA_NOTIFY_PATH}`;

  const answer = (response: { statusCode: number; body: string }): HttpAnswer => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(response.body) as Record<string, unknown>; } catch { body = {}; }
    return Object.freeze({ status: response.statusCode, body, text: response.body });
  };
  const headersFor = (person: BillingPerson | null, mutating: boolean): Record<string, string> =>
    person === null ? (mutating ? { origin: TEST_APP_ORIGIN } : {}) : { ...testSessionHeaders(person.identity, mutating) };

  const stack: BillingStack = {
    database, runtime, netopia, notifyUrl, mail, invoices, tax,
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
    async cardTokenOf(ownerRef) {
      const subscription = await billingRepository.subscriptionForOwner(ownerRef);
      if (subscription === null) return null;
      return foldSubscription(await billingRepository.subscriptionEvents(subscription.subscriptionId)).cardTokenId;
    },

    async get(person, url, ip) {
      return answer(await api.inject({ method: "GET", url, remoteAddress: ip ?? person?.ip ?? TEST_IPS.RO, headers: headersFor(person, false) }));
    },
    async post(person, url, payload, ip) {
      return answer(await api.inject({ method: "POST", url, remoteAddress: ip ?? person?.ip ?? TEST_IPS.RO, headers: headersFor(person, true), payload: payload as Record<string, unknown> }));
    },
    async delete(person, url, payload) {
      return answer(await api.inject({ method: "DELETE", url, remoteAddress: person.ip, headers: headersFor(person, true), payload: payload as Record<string, unknown> }));
    },
    async addEmailChannel(person) {
      // The columns P1b's erasure fixture writes for a verified address (tests/support/billingAccountFixture.ts).
      await database.pool.query(`
        INSERT INTO identity.channel_binding(
          channel_binding_id,user_id,channel_type,address_ciphertext,state,created_at,
          verified_at,verification_token_hash,verification_expires_at,
          verification_last_sent_at,verification_consumed_at,delivery_status,delivery_error
        ) VALUES ($1,$2,'email','{}','verified',clock_timestamp(),clock_timestamp(),$3,
          clock_timestamp()+interval '1 hour',clock_timestamp()-interval '1 hour',clock_timestamp(),'sent',NULL)
      `, [randomUUID(), person.userId, opaqueHash()]);
    },
    async commitErasure(person) {
      const request = await database.pool.query<{ erasure_id: string }>(`
        UPDATE identity.account_erasure_request SET execute_at = clock_timestamp()
        WHERE user_id = $1 AND cancelled_at IS NULL AND committed_at IS NULL
        RETURNING erasure_id::text AS erasure_id
      `, [person.userId]);
      if (request.rows.length !== 1) throw new Error("BILLING_STACK_ERASURE_NOT_SCHEDULED");
      return eraseBillingTestAccount(database.pool, {
        userId: person.userId, ownerRef: person.ownerRef, sessionId: person.identity.authenticated.session.session_id,
        erasureId: request.rows[0]!.erasure_id
      });
    },
    async notify(input) {
      return answer(await api.inject({
        method: "POST", url: NETOPIA_NOTIFY_PATH, remoteAddress: "198.51.100.20",
        headers: {
          "content-type": input.contentType ?? "application/json",
          ...(input.header === undefined ? {} : { "verification-token": input.header })
        },
        payload: input.rawBody
      }));
    },
    async deliverNotices() {
      return netopia.deliverNotices(notifyUrl);
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
      return stack.post(person, "/v1/billing/quote", { plan_id: planId, country, ...(PAYER_OF[country] ?? {}) });
    },
    async checkout(person, quoteRef) {
      return stack.post(person, "/v1/billing/checkout", { quote_ref: quoteRef, locale: "en", consents: stack.consents("en") });
    },
    async pay(checkout, cardCountry, outcome = "APPROVE") {
      netopia.pay(String(checkout.body.charge_ref), outcome, undefined, netopiaCountry(cardCountry));
      return stack.deliverNotices();
    },

    async subscribe(person, planId, cardCountry) {
      const quote = await stack.quote(person, planId);
      if (quote.status !== 200) throw new Error(`BILLING_STACK_QUOTE_${quote.status}_${String(quote.body.error)}`);
      const checkout = await stack.checkout(person, String(quote.body.quote_ref));
      if (checkout.status !== 200) throw new Error(`BILLING_STACK_CHECKOUT_${checkout.status}_${String(checkout.body.error)}`);
      const delivered = await stack.pay(checkout, cardCountry);
      if (delivered.some((delivery) => delivery.httpStatus !== 200)) throw new Error("BILLING_STACK_NOTICE_REFUSED");
      await stack.runJobs();
      return String(checkout.body.charge_ref);
    },

    // The notice route kicks the worker in the background (P9a), so "done" is: no job due now is still open,
    // whoever claimed it. Retries scheduled for later are not due, and wait for the clock.
    async runJobs() {
      for (let round = 1; round <= 200; round += 1) {
        // NETOPIA posts each message at once: deliver what the fake queued (a renewal's, an admin refund's, a dispute's).
        if (netopia.pendingNotices() > 0) await stack.deliverNotices();
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
    async reconcile() {
      const report = await reconciler.tick();
      await stack.runJobs();
      return report;
    },
    async refundDone(chargeRef, amount) {
      const output: string[] = [];
      const sink = { stdout: (text: string) => { output.push(text); }, stderr: (text: string) => { output.push(text); } };
      const code = await runBillingRefundDoneCli(["--charge", chargeRef, "--amount", amount, "--confirm"], sink, async () => {
        // As the command's entry block: N15b's `--despite-chargeback` reaches the plan.
        const plan = (input: RefundDoneArguments) => ownerDesk.planOwnerRefund(input.chargeRef, input.amountMicros, {
          despiteChargeback: input.despiteChargeback
        });
        return Object.freeze({
          plan, record: async (input: RefundDoneArguments) => ownerDesk.recordOwnerRefund(await plan(input), now()),
          close: async () => undefined
        });
      });
      if (code !== 0) throw new Error(`BILLING_STACK_REFUND_DONE_${code}:${output.join("").trim()}`);
      await stack.runJobs();
      return output.join("");
    },
    async runOwnerJobs() {
      const queued = await ownerJobs.schedule();
      await stack.runJobs();
      return queued;
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
      relay.closeAllConnections();
      await new Promise<void>((resolve) => { relay.close(() => resolve()); });
      await netopia.close();
      await database.stop();
    }
  };
  return stack;
}
