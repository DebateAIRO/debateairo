import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openRecord } from "@debateai/crypto";
import { CompleteSocialSignupRequestSchema } from "@debateai/contract";
import type { ItalyApprovalAcceptanceRow, PendingAccountInput, SocialSignupAuthority } from "@debateai/db";
import type { GeoLookup, GeoLookupResult } from "@debateai/geo";
import { currentDocument } from "@debateai/legal-manifest";
import { COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW, countryPolicyFromValue } from "@debateai/register";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { CountryGate } from "../../apps/api/src/country-gate.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
import {
  AuthFlowError,
  InProcessAuthRateLimiter,
  RegistrationService,
  type AuthSourceAdmission,
  type RegistrationSource
} from "../../apps/api/src/registration.js";
import type { TurnstileVerifier } from "../../apps/api/src/turnstile.js";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";
import { passedTurnstile } from "../support/turnstileFixtures.js";

/**
 * Italy clause approval S01, P16 + P17 (R7, R9-R12, R15, R19): the sign-up routes decide with the same OR the page
 * shows (Italy picked in Region, or the request IP in Italy), refuse a triggered sign-up that lacks the approval with
 * one constant 409, and carry the leg on the source to the row the service builds. A real RegistrationService over
 * capturing repositories; a fake GeoLookup; no database, no stack.
 */
const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
const countryPolicy = countryPolicyFromValue(
  COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.value, COUNTRY_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);
const USER_AGENT = "italy-approval-test/1";
const REFUSAL = '{"error":"ITALY_APPROVAL_REQUIRED","message":"ITALY_APPROVAL_REQUIRED"}';
const CLAUSES = [11, 12, 14, 15, 18];
const STANDARD_KINDS = ["ADULT", "TERMS", "PRIVACY_SHOWN"];
const PLACES: Readonly<Record<string, GeoLookupResult>> = {
  "151.1.1.1": { country: "IT", tor: false },
  "81.196.20.30": { country: "RO", tor: false },
  "185.220.101.7": { country: "IT", tor: true },
  "5.45.1.1": { country: "RU", tor: false },
  "10.0.0.1": { country: "XX", tor: false }
};
const AUTHORITY: SocialSignupAuthority = Object.freeze({
  proofHash: "a".repeat(64), browserHash: "b".repeat(64), bindingHash: "c".repeat(64), admittedProviders: ["google"]
});
const BASE = Object.freeze({
  email: "alice@example.test",
  date_of_birth: "1990-01-01",
  terms: currentDocument("TERMS", "en")!,
  privacy: currentDocument("PRIVACY", "en")!,
  locale: "en",
  ui_locale: "en-GB",
  time_zone: null,
  turnstile_token: "controlled-fixture-proof"
});

type Surface = "register" | "social_complete";
type Region = Readonly<{ country: string; us_state?: string }>;
type Leg = "PICKED" | "IP" | "BOTH";
const SURFACES: readonly Surface[] = ["register", "social_complete"];
const URL_OF: Readonly<Record<Surface, string>> = {
  register: "/v1/auth/register",
  social_complete: "/v1/auth/social/signup/complete"
};
const ITALY: Region = { country: "IT" };
const FRANCE: Region = { country: "FR" };

function bodyFor(surface: Surface, region: Region, extra: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return surface === "register"
    ? { ...BASE, password: "correct horse battery staple", ...region, ...extra }
    : { ...BASE, continuation_token: "t".repeat(43), ...region, ...extra };
}

/** The four cells of the OR, plus a US resident on an Italian address (the US state plays no part). */
function cases(surface: Surface): ReadonlyArray<Readonly<{ name: string; region: Region; ip: string; leg: Leg | null }>> {
  return [
    { name: "picked and IP", region: ITALY, ip: "151.1.1.1", leg: "BOTH" },
    { name: "picked only", region: ITALY, ip: "81.196.20.30", leg: "PICKED" },
    // On social the IP-only cell comes from a Tor exit placed in Italy (R15: Tor counts as IT).
    { name: "IP only", region: FRANCE, ip: surface === "register" ? "151.1.1.1" : "185.220.101.7", leg: "IP" },
    { name: "neither", region: FRANCE, ip: "81.196.20.30", leg: null },
    { name: "a US resident on an Italian IP", region: { country: "US", us_state: "TX" }, ip: "151.1.1.1", leg: "IP" }
  ];
}
const triggered = (surface: Surface) => cases(surface).slice(0, 3);

function fakeLookup() {
  const lookup = vi.fn((ip: string): GeoLookupResult => PLACES[ip] ?? { country: "XX", tor: false });
  return { lookup, close: () => undefined } satisfies GeoLookup;
}

type Composition = "lookup" | "throwing" | "log-only" | "absent";

function fixture(options: Readonly<{
  composition?: Composition;
  gate?: boolean;
  duplicate?: boolean;
  turnstile?: TurnstileVerifier;
}> = {}) {
  const recordsKey = randomBytes(32);
  const pending: PendingAccountInput[] = [];
  const social: Array<Omit<PendingAccountInput, "passwordHash">> = [];
  const mail = new MemoryMailSender();
  const recordRegistrationFailure = vi.fn(async () => undefined);
  const recordRateLimitRefusal = vi.fn(async () => undefined);
  const registration = new RegistrationService({
    repository: {
      findAuditIdentityByBlindIndex: async () => null,
      createPendingAccount: async (input: PendingAccountInput, beforeCommit: () => Promise<void>) => {
        pending.push(input);
        await beforeCommit();
        return options.duplicate === true
          ? { status: "email_duplicate" as const, userId: randomUUID() }
          : {
            status: "created" as const, userId: input.userId, channelBindingId: randomUUID(),
            verificationExpiresAt: input.verificationExpiresAt, reservationId: randomUUID()
          };
      },
      recordVerificationDelivery: async () => undefined,
      recordVerificationDeliveryRecordFailure: async () => undefined,
      recordDuplicateRegistrationPostwork: async () => undefined,
      recordRegistrationFailure,
      recordRateLimitRefusal
    } as never,
    socialRepository: {
      createAccount: async (input: Omit<PendingAccountInput, "passwordHash">, beforeCommit: () => Promise<void>) => {
        social.push(input);
        await beforeCommit();
        return options.duplicate === true
          ? { status: "collision" as const }
          : {
            status: "created" as const, userId: input.userId, channelBindingId: randomUUID(),
            verificationExpiresAt: input.verificationExpiresAt, reservationId: randomUUID()
          };
      }
    } as never,
    mail,
    dekStore: { store: async () => undefined, destroy: async () => "ALREADY_ABSENT" as const },
    blindIndexKey: Buffer.alloc(32, 0x3c),
    policy,
    limiter: new InProcessAuthRateLimiter(policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs),
    argon2: {
      async hashPassword() { return `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`; },
      async verifyPassword() { return false; },
      async hashAuditContext() { return "ab".repeat(32); }
    } as never,
    sleep: async () => undefined,
    legalAcceptance: { recordsKey }
  });
  const completeSignup = vi.fn(async (body: unknown, source: RegistrationSource, admission: AuthSourceAdmission) => {
    const parsed = CompleteSocialSignupRequestSchema.safeParse(body);
    if (!parsed.success) throw new AuthFlowError("AUTH_INPUT_INVALID");
    return registration.registerSocial({ email: parsed.data.email, phone: null, adultAffirmed: true }, source, AUTHORITY, admission);
  });
  const lookup = fakeLookup();
  const failing = {
    lookup: vi.fn((_ip: string): GeoLookupResult => { throw new Error("controlled lookup failure"); }),
    close: () => undefined
  } satisfies GeoLookup;
  const lines: string[] = [];
  const log = (line: string): void => { lines.push(line); };
  const composition = options.composition ?? "lookup";
  const api = buildApi({
    allowedOrigin: TEST_APP_ORIGIN,
    application: {} as AskApplication,
    turnstile: options.turnstile ?? passedTurnstile,
    registration,
    socialAuth: { completeSignup } as never,
    ...(composition === "lookup" ? { italyApproval: { lookup, log } } : {}),
    ...(composition === "throwing" ? { italyApproval: { lookup: failing, log } } : {}),
    ...(composition === "log-only" ? { italyApproval: { log } } : {}),
    ...(options.gate === true ? {
      countryGate: new CountryGate({
        policy: countryPolicy, lookup, audit: { recordCountryGateRefusal: vi.fn(async () => undefined) }
      })
    } : {})
  });
  const created = (surface: Surface): ReadonlyArray<Omit<PendingAccountInput, "passwordHash">> =>
    surface === "register" ? pending : social;
  const post = (surface: Surface, ip: string, body: Record<string, unknown>) => api.inject({
    method: "POST", url: URL_OF[surface], remoteAddress: ip,
    headers: { origin: TEST_APP_ORIGIN, "user-agent": USER_AGENT }, payload: body
  });
  return {
    api, registration, recordsKey, pending, social, created, mail, lookup, failing, lines, completeSignup,
    recordRegistrationFailure, recordRateLimitRefusal, post
  };
}
type Fixture = ReturnType<typeof fixture>;

const open: Fixture[] = [];
function track(value: Fixture): Fixture {
  open.push(value);
  return value;
}
afterEach(async () => {
  for (const value of open.splice(0)) {
    await value.registration.drainMailDispatches();
    await value.api.close();
    await value.registration.drainRateLimitAuditFlushes();
  }
  vi.restoreAllMocks();
});

function evidenceOf(recordsKey: Buffer, row: ItalyApprovalAcceptanceRow): unknown {
  return JSON.parse(openRecord(recordsKey, {
    table: "legal.acceptance", column: "evidence_ciphertext", rowId: row.acceptanceId
  }, row.evidenceCiphertext).toString("utf8"));
}

/** The row the service built for this request: the clauses, the leg, and evidence sealed to that row and request. */
function expectItalyRow(f: Fixture, input: Omit<PendingAccountInput, "passwordHash"> | undefined, leg: Leg, ip: string): void {
  const row = input?.italyApproval;
  expect(row).toBeDefined();
  expect(row!.clauses).toEqual(CLAUSES);
  expect(row!.leg).toBe(leg);
  expect(row!.keyId).toMatch(/^[0-9a-f]{16}$/u);
  expect(evidenceOf(f.recordsKey, row!)).toEqual({ ip, user_agent: USER_AGENT });
  // The three standard sign-up rows stay exactly as they were, each with its own id.
  expect(input!.acceptances?.map((acceptance) => acceptance.kind)).toEqual(STANDARD_KINDS);
  expect(input!.acceptances?.map((acceptance) => acceptance.acceptanceId)).not.toContain(row!.acceptanceId);
}

function expectNoItalyRow(input: Omit<PendingAccountInput, "passwordHash"> | undefined): void {
  expect(input).toBeDefined();
  expect("italyApproval" in input!).toBe(false);
  expect(input!.acceptances?.map((acceptance) => acceptance.kind)).toEqual(STANDARD_KINDS);
}

describe.each(SURFACES)("Italy clause approval on %s (P16, P17)", (surface) => {
  it("A1: the four cells and a US resident, approval present, are created with the leg the server decided", async () => {
    const f = track(fixture());
    for (const { name, region, ip, leg } of cases(surface)) {
      f.lookup.lookup.mockClear();
      const before = f.created(surface).length;
      const response = await f.post(surface, ip, bodyFor(surface, region, { italy_approval: true }));
      await f.registration.drainMailDispatches();
      expect(response.statusCode, name).toBe(202);
      expect(response.json(), name).toEqual({
        message: "If this address can be registered, verification instructions will arrive. Check your spam folder.",
        retry_after_seconds: 60
      });
      expect(f.created(surface), name).toHaveLength(before + 1);
      const input = f.created(surface).at(-1);
      if (leg === null) expectNoItalyRow(input);
      else expectItalyRow(f, input, leg, ip);
      // The IP leg asks the one lookup once, with this request's own address.
      expect(f.lookup.lookup.mock.calls, name).toEqual([[ip]]);
    }
    expect(f.lines).toEqual([]);
  });

  it("A2: a triggered sign-up without the approval is refused with one constant 409 and leaves nothing behind", async () => {
    const f = track(fixture());
    let requests = 0;
    for (const { name, region, ip } of triggered(surface)) {
      const response = await f.post(surface, ip, bodyFor(surface, region));
      requests += 1;
      await f.registration.drainMailDispatches();
      expect(response.statusCode, name).toBe(409);
      // EXACT: no leg, no country, no hint of which test fired.
      expect(response.body, name).toBe(REFUSAL);
      // The slot the request was admitted under is released by the onResponse hook.
      expect(f.registration.registrationAdmissionOccupancy(), name).toMatchObject({
        admitted: 0, admissions: requests, releases: requests
      });
    }
    expect(f.pending).toEqual([]);
    expect(f.social).toEqual([]);
    expect(f.completeSignup).not.toHaveBeenCalled();
    expect(f.mail.messages).toEqual([]);
    expect(f.recordRegistrationFailure).not.toHaveBeenCalled();
    expect(f.recordRateLimitRefusal).not.toHaveBeenCalled();
    // The fourth cell: neither leg, no approval, is an ordinary sign-up.
    const neither = await f.post(surface, "81.196.20.30", bodyFor(surface, FRANCE));
    await f.registration.drainMailDispatches();
    expect(neither.statusCode).toBe(202);
    expect(f.created(surface)).toHaveLength(1);
    expectNoItalyRow(f.created(surface)[0]);
    expect(f.registration.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0, admissions: 4, releases: 4 });
    expect(f.lines).toEqual([]);
  });

  it("A3: the IP-only sign-up refused, then sent again with the approval from the same address, is created with leg IP", async () => {
    const f = track(fixture());
    const { region, ip } = triggered(surface)[2]!;
    const refused = await f.post(surface, ip, bodyFor(surface, region));
    expect(refused.statusCode).toBe(409);
    expect(refused.body).toBe(REFUSAL);
    expect(f.created(surface)).toHaveLength(0);
    const approved = await f.post(surface, ip, bodyFor(surface, region, { italy_approval: true }));
    await f.registration.drainMailDispatches();
    expect(approved.statusCode).toBe(202);
    expect(f.created(surface)).toHaveLength(1);
    expectItalyRow(f, f.created(surface)[0], "IP", ip);
  });

  it("A4: every earlier guard answers first: the country gate, the US state, the age, stale documents, the bot check", async () => {
    const f = track(fixture({ gate: true }));
    // The control: with the gate composed, an Italian sign-up without the approval is the Italy refusal.
    const control = await f.post(surface, "151.1.1.1", bodyFor(surface, ITALY));
    expect(control.statusCode).toBe(409);
    expect(control.body).toBe(REFUSAL);
    const country = await f.post(surface, "5.45.1.1", bodyFor(surface, ITALY));
    expect([country.statusCode, country.json()]).toEqual([403, { error: "COUNTRY_SIGNUP_UNAVAILABLE" }]);
    const state = await f.post(surface, "151.1.1.1", bodyFor(surface, { country: "US", us_state: "TN" }));
    expect([state.statusCode, state.json()]).toEqual([403, { error: "STATE_SIGNUP_UNAVAILABLE" }]);
    const age = await f.post(surface, "151.1.1.1", bodyFor(surface, ITALY, { date_of_birth: "2020-01-01" }));
    expect(age.statusCode).toBe(403);
    expect(age.json()).toMatchObject({ error: "AUTH_AGE_REFUSED" });
    const stale = await f.post(surface, "151.1.1.1", bodyFor(surface, ITALY, {
      terms: { ...currentDocument("TERMS", "en")!, sha256: "0".repeat(64) }
    }));
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ error: "LEGAL_DOCUMENT_STALE" });
    const bot = track(fixture({ gate: true, turnstile: { verify: async () => "rejected" } }));
    const rejected = await bot.post(surface, "151.1.1.1", bodyFor(surface, ITALY));
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: "TURNSTILE_REJECTED" });
    expect(f.created(surface)).toHaveLength(0);
    expect(bot.created(surface)).toHaveLength(0);
    expect(f.registration.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0 });
    expect(bot.registration.registrationAdmissionOccupancy()).toMatchObject({ admitted: 0 });
  });

  it("A5: an address that already holds an account gets the same answers as a new one", async () => {
    const fresh = track(fixture());
    const taken = track(fixture({ duplicate: true }));
    const answers = async (f: Fixture) => {
      const refused = await f.post(surface, "151.1.1.1", bodyFor(surface, ITALY));
      const approved = await f.post(surface, "151.1.1.1", bodyFor(surface, ITALY, { italy_approval: true }));
      await f.registration.drainMailDispatches();
      return [refused.statusCode, refused.body, approved.statusCode, approved.body];
    };
    const freshAnswers = await answers(fresh);
    expect(freshAnswers).toEqual([409, REFUSAL, 202, expect.any(String)]);
    expect(await answers(taken)).toEqual(freshAnswers);
    expect(taken.created(surface)).toHaveLength(1);
    expectItalyRow(taken, taken.created(surface)[0], "BOTH", "151.1.1.1");
  });

  it("A6: an approval sent where neither leg fired is ignored and never stored", async () => {
    const f = track(fixture());
    const response = await f.post(surface, "81.196.20.30", bodyFor(surface, FRANCE, { italy_approval: true }));
    await f.registration.drainMailDispatches();
    expect(response.statusCode).toBe(202);
    expect(f.created(surface)).toHaveLength(1);
    expectNoItalyRow(f.created(surface)[0]);
    expect(f.lines).toEqual([]);
  });

  it("A7: a browser-sent leg and any approval value but true are invalid input", async () => {
    const f = track(fixture());
    for (const extra of [{ italy_leg: "IP" }, { italy_approval: false }, { italy_leg: "IP", italy_approval: true }]) {
      const response = await f.post(surface, "151.1.1.1", bodyFor(surface, ITALY, extra));
      expect(response.statusCode, JSON.stringify(extra)).toBe(400);
      expect(response.json(), JSON.stringify(extra)).toMatchObject({ error: "AUTH_INPUT_INVALID" });
    }
    expect(f.created(surface)).toHaveLength(0);
    expect(f.completeSignup).not.toHaveBeenCalled();
  });

  it("A8: without a usable lookup the picked leg still decides, and each sign-up says why the IP leg was skipped", async () => {
    const skipped = (reason: string) => `{"event":"italy_approval.ip_leg_skipped","surface":"${surface}","reason":"${reason}"}`;
    const throwing = track(fixture({ composition: "throwing" }));
    const refusedOnFailure = await throwing.post(surface, "151.1.1.1", bodyFor(surface, ITALY));
    expect([refusedOnFailure.statusCode, refusedOnFailure.body]).toEqual([409, REFUSAL]);
    // The IP leg is skipped, so an Italian address with a French pick owes nothing.
    const openOnFailure = await throwing.post(surface, "151.1.1.1", bodyFor(surface, FRANCE));
    await throwing.registration.drainMailDispatches();
    expect(openOnFailure.statusCode).toBe(202);
    expectNoItalyRow(throwing.created(surface)[0]);
    expect(throwing.failing.lookup).toHaveBeenCalledTimes(2);
    expect(throwing.lines).toEqual([skipped("LOOKUP_FAILED"), skipped("LOOKUP_FAILED")]);

    const unknown = track(fixture());
    const refusedUnknown = await unknown.post(surface, "10.0.0.1", bodyFor(surface, ITALY));
    expect([refusedUnknown.statusCode, refusedUnknown.body]).toEqual([409, REFUSAL]);
    expect(unknown.lines).toEqual([skipped("NO_COUNTRY")]);

    const unlooked = track(fixture({ composition: "log-only" }));
    const refusedUnlooked = await unlooked.post(surface, "151.1.1.1", bodyFor(surface, ITALY));
    const openUnlooked = await unlooked.post(surface, "151.1.1.1", bodyFor(surface, FRANCE));
    await unlooked.registration.drainMailDispatches();
    expect([refusedUnlooked.statusCode, openUnlooked.statusCode]).toEqual([409, 202]);
    expect(unlooked.lines).toEqual([skipped("NO_LOOKUP"), skipped("NO_LOOKUP")]);

    // A composition that predates the mission: the picked leg decides and nothing is logged anywhere.
    const consoleLines: unknown[][] = [];
    for (const method of ["error", "log", "warn", "info"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { consoleLines.push(args); });
    }
    const absent = track(fixture({ composition: "absent" }));
    const refusedAbsent = await absent.post(surface, "151.1.1.1", bodyFor(surface, ITALY));
    const openAbsent = await absent.post(surface, "151.1.1.1", bodyFor(surface, FRANCE));
    await absent.registration.drainMailDispatches();
    expect([refusedAbsent.statusCode, refusedAbsent.body, openAbsent.statusCode]).toEqual([409, REFUSAL, 202]);
    expect(absent.lines).toEqual([]);
    expect(absent.lookup.lookup).not.toHaveBeenCalled();
    expect(consoleLines.filter((args) => args.some((arg) => String(arg).includes("italy_approval")))).toEqual([]);
  });
});

describe("the country check page learns nothing about Italy (P16, R19)", () => {
  it("A9: GET /v1/geo/availability from an Italian address with no gate keeps exactly signup, pay and service", async () => {
    const f = track(fixture());
    const response = await f.api.inject({
      method: "GET", url: "/v1/geo/availability", remoteAddress: "151.1.1.1",
      headers: { origin: TEST_APP_ORIGIN, "user-agent": USER_AGENT }
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"signup":true,"pay":false,"service":true}');
    expect(f.lookup.lookup).not.toHaveBeenCalled();
  });
});
