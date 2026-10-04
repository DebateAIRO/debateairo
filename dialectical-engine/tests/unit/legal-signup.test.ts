import { canonicalSignup, passedTurnstile } from "../support/turnstileFixtures.js";
import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { currentDocument } from "@debateai/legal-manifest";
import { openRecord } from "@debateai/crypto";
import type { PendingAccountInput } from "@debateai/db";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { resolveSignUpDocuments, sealAcceptanceEvidence, signUpAcceptanceRows } from "../../apps/api/src/legal.js";
import { AuthFlowError, InProcessAuthRateLimiter, RegistrationService } from "../../apps/api/src/registration.js";
import { MemoryMailSender } from "../../apps/api/src/mail-channel.js";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "../../packages/register/src/auth-policy.js";

const policy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
const terms = (locale: string) => currentDocument("TERMS", locale)!;
const privacy = (locale: string) => currentDocument("PRIVACY", locale)!;
const SOURCE = { ip: "81.196.1.2", userAgent: "test/1", requestId: "request-1" };

function serviceCapturing(recordsKey: Buffer | undefined) {
  const captured: PendingAccountInput[] = [];
  const service = new RegistrationService({
    repository: {
      findAuditIdentityByBlindIndex: async () => null,
      createPendingAccount: async (input: PendingAccountInput, beforeCommit: () => Promise<void>) => {
        captured.push(input);
        await beforeCommit();
        return { status: "created" as const, userId: input.userId, channelBindingId: randomUUID(), verificationExpiresAt: input.verificationExpiresAt, reservationId: randomUUID() };
      },
      recordVerificationDelivery: async () => undefined,
      recordRegistrationFailure: async () => undefined,
      recordRateLimitRefusal: async () => undefined
    } as never,
    mail: new MemoryMailSender(),
    dekStore: { store: async () => undefined, destroy: async () => "ALREADY_ABSENT" as const },
    blindIndexKey: Buffer.alloc(32, 0x3c),
    policy,
    limiter: new InProcessAuthRateLimiter(
      policy.rateLimits, policy.rateLimitBucketCapacity, policy.rateLimitRefusalAuditIntervalMs
    ),
    argon2: {
      async hashPassword() { return `$argon2id$v=19$m=65536,t=3,p=1$${"A".repeat(22)}$${"A".repeat(43)}`; },
      async verifyPassword() { return false; },
      async hashAuditContext() { return "ab".repeat(32); }
    } as never,
    sleep: async () => undefined,
    ...(recordsKey === undefined ? {} : { legalAcceptance: { recordsKey } })
  });
  return { service, captured };
}

/** Trusted service compositions can still provision optional recovery addresses. */
const REGISTRATION = Object.freeze({
  email: "alice@example.test",
  password: "correct horse battery staple",
  phone: "+40722123456", recoveryEmail: "alice.recovery@example.test",
  adultAffirmed: true
});
/** The pairs ride on the source, as sourceFor sends them (the age gate's countryCode rides there too). */
const sourceWith = (legal: unknown) => (legal === undefined ? SOURCE : { ...SOURCE, legal: legal as never });

describe("sign-up records the Terms and Privacy pairs (paid plans L3b)", () => {
  it("resolves the displayed pairs against the manifest, falling back to English", () => {
    expect(resolveSignUpDocuments({ terms: terms("ro"), privacy: privacy("ro"), locale: "ro" })).toEqual({
      terms: { ...terms("ro"), locale: "ro" }, privacy: { ...privacy("ro"), locale: "ro" }
    });
    // A locale chunk that failed to load shows English (useLegalDocument): recorded as English.
    expect(resolveSignUpDocuments({ terms: terms("en"), privacy: privacy("ro"), locale: "ro" })).toEqual({
      terms: { ...terms("en"), locale: "en" }, privacy: { ...privacy("ro"), locale: "ro" }
    });
    expect(resolveSignUpDocuments({ terms: { ...terms("ro"), sha256: "0".repeat(64) }, privacy: privacy("ro"), locale: "ro" }))
      .toBeNull();
    expect(resolveSignUpDocuments(undefined)).toBeNull();
  });

  it("seals one evidence per row under the records key, bound to that row", () => {
    const recordsKey = randomBytes(32);
    const documents = resolveSignUpDocuments({ terms: terms("de"), privacy: privacy("de"), locale: "de" })!;
    const rows = signUpAcceptanceRows({ recordsKey, documents, source: SOURCE });
    expect(rows.map((row) => row.kind)).toEqual(["ADULT", "TERMS", "PRIVACY_SHOWN"]);
    expect(rows[0]!.documentSha256).toBe(terms("de").sha256);
    expect(rows[2]!.documentSha256).toBe(privacy("de").sha256);
    expect(new Set(rows.map((row) => row.acceptanceId)).size).toBe(3);
    for (const row of rows) {
      const evidence = openRecord(recordsKey, {
        table: "legal.acceptance", column: "evidence_ciphertext", rowId: row.acceptanceId
      }, row.evidenceCiphertext);
      expect(JSON.parse(evidence.toString("utf8"))).toEqual({ ip: "81.196.1.2", user_agent: "test/1" });
    }
  });

  it("bounds what it seals, so no header can push the evidence past 0080's 4096-byte CHECK", () => {
    const recordsKey = randomBytes(32);
    const acceptanceId = randomUUID();
    const aad = { table: "legal.acceptance", column: "evidence_ciphertext", rowId: acceptanceId };
    // Node admits a 16 KiB header block; a 10 KB user agent is a legal request.
    const long = sealAcceptanceEvidence(recordsKey, acceptanceId, { ip: "81.196.1.2", userAgent: `x${"y".repeat(10_239)}` });
    expect(long.evidenceCiphertext.byteLength).toBeLessThanOrEqual(4096);
    expect(JSON.parse(openRecord(recordsKey, aad, long.evidenceCiphertext).toString("utf8"))).toEqual({
      ip: "81.196.1.2", user_agent: `x${"y".repeat(255)}`
    });
    const blank = sealAcceptanceEvidence(recordsKey, acceptanceId, { ip: "81.196.1.2", userAgent: "   " });
    expect(JSON.parse(openRecord(recordsKey, aad, blank.evidenceCiphertext).toString("utf8")))
      .toEqual({ ip: "81.196.1.2", user_agent: "unknown" });
  });

  it("passes the three rows into the account's own transaction when the records key is composed", async () => {
    const { service, captured } = serviceCapturing(randomBytes(32));
    await service.register(REGISTRATION, sourceWith({ terms: terms("en"), privacy: privacy("en"), locale: "en" }));
    await service.drainMailDispatches();
    expect(captured).toHaveLength(1);
    expect(captured[0]!.acceptances?.map((row) => row.kind)).toEqual(["ADULT", "TERMS", "PRIVACY_SHOWN"]);
    // PR #41's age record still travels with the same account (L3a's wrapper writes both).
    expect(captured[0]!.ageCheck.minAgeApplied).toBeGreaterThanOrEqual(18);
  });

  it("registers exactly as before, recording nothing, when no records key is composed", async () => {
    const { service, captured } = serviceCapturing(undefined);
    await service.register(REGISTRATION, SOURCE);
    await service.drainMailDispatches();
    expect(captured).toHaveLength(1);
    expect(captured[0]!.acceptances).toBeUndefined();
  });

  it("refuses a missing or stale pair with LEGAL_DOCUMENT_STALE (409) before any account work", async () => {
    const { service, captured } = serviceCapturing(randomBytes(32));
    for (const legal of [undefined, { terms: terms("en"), privacy: { ...privacy("en"), version: "2.9" }, locale: "en" }]) {
      const failure = await service.register(REGISTRATION, sourceWith(legal)).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AuthFlowError);
      expect((failure as AuthFlowError).code).toBe("LEGAL_DOCUMENT_STALE");
      expect((failure as AuthFlowError).statusCode).toBe(409);
    }
    expect(captured).toEqual([]);
  });

  it("carries a well-formed pair from the register body to the service's source, never into the frozen mount's input", async () => {
    const inputs: unknown[] = [];
    const seen: unknown[] = [];
    const api = buildApi({
      application: {} as AskApplication,
      turnstile: passedTurnstile,
      registration: {
        register: async (input: unknown, source: { legal?: unknown }) => {
          inputs.push(input);
          seen.push(source.legal);
          if (source.legal === undefined) throw new AuthFlowError("LEGAL_DOCUMENT_STALE");
          return { message: "If this address can be registered, verification instructions will arrive. Check your spam folder." };
        },
        verifyEmail: async () => ({ status: "mfa_required" as const }),
        resendVerification: async () => ({ message: "" }) as never
      } as never
    });
    // The age gate's hook needs an adult date before register runs at all (apps/api/src/index.ts:1711-1729).
    const body = {
      ...canonicalSignup,
      email: "alice@example.test", password: "correct horse battery staple",
      phone: "+40722123456", date_of_birth: "1990-01-01"
    };
    const stale = await api.inject({ method: "POST", url: "/v1/auth/register", payload: { ...body, terms: undefined } });
    expect(stale.statusCode).toBe(400);
    expect(stale.json()).toMatchObject({ error: "AUTH_INPUT_INVALID" });
    expect(inputs).toEqual([]);
    const fresh = await api.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { ...body, terms: terms("en"), privacy: privacy("en"), locale: "en" }
    });
    expect(fresh.statusCode).toBe(202);
    expect(seen[0]).toEqual({ terms: terms("en"), privacy: privacy("en"), locale: "en" });
    // Malformed legal facts are refused before proof or identity work.
    const malformed = await api.inject({
      method: "POST", url: "/v1/auth/register",
      payload: { ...body, terms: { version: "v2", sha256: "x" }, privacy: privacy("en"), locale: "en" }
    });
    expect(malformed.statusCode).toBe(400);
    expect(seen).toHaveLength(1);
    // The public mount sets recovery absent and keeps adult affirmation a server decision.
    expect(inputs[0]).toEqual({
      email: "alice@example.test", password: "correct horse battery staple",
      phone: "+40722123456", recoveryEmail: null, adultAffirmed: true
    });
    await api.close();
  });

  it("is composed with the records key in the API boot", async () => {
    const { readFile } = await import("node:fs/promises");
    expect(await readFile("apps/api/src/main.ts", "utf8")).toContain("legalAcceptance: { recordsKey }");
  });
});
