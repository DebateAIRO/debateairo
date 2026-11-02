import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostgresAuthenticationRiskSignalRepository } from "../../packages/db/src/auth-risk.js";
import { PostgresConsumerAuthRepository } from "../../packages/db/src/consumer-auth.js";
import { PostgresEmailChangeRepository } from "../../packages/db/src/email-change.js";
import { PostgresRecoveryEmailRepository } from "../../packages/db/src/recovery-email.js";
import { PostgresSessionRepository } from "../../packages/db/src/sessions.js";
import { PostgresSocialIdentityRepository } from "../../packages/db/src/social-identity.js";

/**
 * K09 NV-42: which repository methods may reach the reserved login audit
 * capacity. Exactly the login success steps (each after the per-source budget
 * and a verified credential) and the post-session risk signal pass "login".
 * Every failure record, every public link route and every signed-in route stays
 * ordinary, so no credential-free request can reach the reserve.
 *
 * Only the hasher arguments matter here: the stub pool lets each method reach
 * its audit derivation, and whatever happens after it is ignored.
 */
const hasher = {
  hashSourceIp: vi.fn(async (_value: string, _priority?: string) => "ab".repeat(32)),
  hashUserAgent: vi.fn(async (_value: string, _priority?: string) => "cd".repeat(32))
};
const audit = hasher as never;
const client = {
  query: async () => ({ rows: [{ outcome: "INVALID", valid: true }] }),
  release() {}
};
const pool = { connect: async () => client, query: async () => ({ rows: [] }) } as never;
const dekStore = { load: async () => Buffer.alloc(32), exists: async () => true } as never;
const source = { ip: "198.51.100.7", userAgent: "login-ua", requestId: "r1" };
const hash = (digit: string): string => `sha256:${digit.repeat(64)}`;
const challenge = { firstStep: "PASSWORD", userId: randomUUID(), challengeId: randomUUID() } as never;
const session = { userId: randomUUID(), sessionId: randomUUID(), tokenHash: hash("2") };
const sessionMaterial = {
  sessionId: randomUUID(),
  sessionTokenHash: hash("3"),
  csrfTokenHash: hash("4"),
  sessionBindingContext: {},
  occurredAt: new Date(),
  idleExpiresAt: new Date(Date.now() + 60_000),
  absoluteExpiresAt: new Date(Date.now() + 120_000)
};

const sessions = (): PostgresSessionRepository => new PostgresSessionRepository(pool, audit);
const consumer = (): PostgresConsumerAuthRepository => new PostgresConsumerAuthRepository(pool, audit);
const social = (): PostgresSocialIdentityRepository => new PostgresSocialIdentityRepository(pool, audit);
const risk = (): PostgresAuthenticationRiskSignalRepository =>
  new PostgresAuthenticationRiskSignalRepository(pool, audit, dekStore, 1, 1);

type Case = [name: string, run: () => Promise<unknown>];

const loginCases: Case[] = [
  ["PostgresSessionRepository.createLoginChallenge", () => sessions().createLoginChallenge({
    identity: { userId: randomUUID(), ownerRef: "o", passwordHash: "x", factorId: randomUUID() } as never,
    challengeId: randomUUID(),
    challengeTokenHash: hash("0"),
    bindingHash: hash("1"),
    occurredAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    source
  })],
  ["PostgresSessionRepository.completeTotpLogin", () => sessions().completeTotpLogin({
    challenge, acceptedStep: 1, bindingHash: hash("1"), ...sessionMaterial, source
  })],
  ["PostgresSessionRepository.completeRecoveryLogin", () => sessions().completeRecoveryLogin({
    challenge, recoveryCodeId: randomUUID(), bindingHash: hash("1"), ...sessionMaterial, source
  })],
  ["PostgresConsumerAuthRepository.completeLogin", () => consumer().completeLogin({
    handleHash: hash("5"), challengeHash: hash("6"), bindingHash: hash("1")
  } as never, source)],
  ["PostgresSocialIdentityRepository.callback", () => social().callback({ claimId: randomUUID() }, source)],
  ["PostgresAuthenticationRiskSignalRepository.recordForSession", () => risk().recordForSession({
    tokenHash: hash("2"), bindingHash: hash("1"), kind: "LOGIN_SUCCESS", source
  })]
];

const controlCases: Case[] = [
  ["PostgresSessionRepository.recordLoginFailure (AUTH_CREDENTIALS_INVALID)", () =>
    sessions().recordLoginFailure({ occurredAt: new Date(), source, reason: "AUTH_CREDENTIALS_INVALID" })],
  ["PostgresSessionRepository.recordLoginFailure (AUTH_MFA_INVALID)", () =>
    sessions().recordLoginFailure({ occurredAt: new Date(), source, reason: "AUTH_MFA_INVALID" })],
  ["PostgresSessionRepository.revokeSession", () => sessions().revokeSession({
    userId: session.userId, sessionId: session.sessionId, occurredAt: new Date(), source
  })],
  ["PostgresSessionRepository.revokeAllSessions", () => sessions().revokeAllSessions({
    userId: session.userId, initiatingSessionId: session.sessionId, occurredAt: new Date(), source
  })],
  ["PostgresSessionRepository.recordStepUpFailure", () => sessions().recordStepUpFailure({
    sessionId: session.sessionId, occurredAt: new Date(), source, reason: "AUTH_CREDENTIALS_INVALID"
  })],
  ["PostgresAuthenticationRiskSignalRepository.recordForRecovery", () => risk().recordForRecovery({
    publicHandle: "handle", kind: "RECOVERY_STARTED", source
  })],
  ["PostgresEmailChangeRepository.confirm", () =>
    new PostgresEmailChangeRepository(pool, audit).confirm({ confirmTokenHash: hash("7"), source })],
  ["PostgresRecoveryEmailRepository.confirm", () =>
    new PostgresRecoveryEmailRepository(pool, audit).confirm(hash("8"), source)],
  ["PostgresSocialIdentityRepository.unlink", () =>
    social().unlink(session, "google", hash("9"), {}, ["google"], source)],
  ["PostgresSocialIdentityRepository.completeStepUp", () =>
    social().completeStepUp({ claimId: randomUUID() }, source)],
  ["PostgresConsumerAuthRepository.completeTotpEnrollment", () => consumer().completeTotpEnrollment({
    enrollmentTokenHash: hash("a"), additionHandleHash: hash("b"), bindingHash: hash("1")
  } as never, [], source)]
];

function priorities(): (string | undefined)[] {
  return [...hasher.hashSourceIp.mock.calls, ...hasher.hashUserAgent.mock.calls].map((call) => call[1]);
}

describe("K09 NV-42 — only login success steps opt into the reserved audit capacity", () => {
  beforeEach(() => {
    hasher.hashSourceIp.mockClear();
    hasher.hashUserAgent.mockClear();
  });

  it.each(loginCases)("%s passes \"login\" to every audit derivation", async (_name, run) => {
    await run().catch(() => undefined);
    // Non-vacuous: both derivations really ran.
    expect(hasher.hashSourceIp).toHaveBeenCalled();
    expect(hasher.hashUserAgent).toHaveBeenCalled();
    for (const priority of priorities()) expect(priority).toBe("login");
  });

  it.each(controlCases)("%s never passes \"login\"", async (_name, run) => {
    await run().catch(() => undefined);
    expect(hasher.hashSourceIp).toHaveBeenCalled();
    expect(hasher.hashUserAgent).toHaveBeenCalled();
    for (const priority of priorities()) expect(priority).not.toBe("login");
  });
});
