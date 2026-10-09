import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SessionService } from "../../apps/api/src/sessions.js";
import {
  AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows, MFA_POLICY_REGISTER_ROW, mfaPolicyFromValue,
  SESSION_POLICY_REGISTER_ROW, sessionPolicyFromValue
} from "@debateai/register";

/**
 * Auth API hardening (2026-10-09, item 5). Sessions minted under the sealed v1
 * session policy carry a 90-day absolute expiry; only NEW sessions were
 * clamped to the consumer 30 days. Every session is now held, when it is read,
 * to the current lifetimes: 30 days from creation, 14 days from last use.
 */
const DAY = 86_400_000;
const now = new Date("2026-10-09T12:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const later = (days: number) => new Date(now.getTime() + days * DAY);
const source = { ip: "198.51.100.30", userAgent: "fixture-agent", requestId: "lifetime" };
const token = () => randomBytes(32).toString("base64url");

function record(createdAt: Date, lastSeenAt: Date) {
  return {
    sessionId: "33333333-3333-4333-8333-333333333333", userId: "11111111-1111-4111-8111-111111111111",
    ownerRef: "22222222-2222-4222-8222-222222222222", csrfTokenHash: "sha256:" + "c".repeat(64),
    createdAt, lastSeenAt,
    // What a v1 session still carries in the database: 90 days absolute, a refreshed idle expiry.
    idleExpiresAt: later(14), absoluteExpiresAt: new Date(createdAt.getTime() + 90 * DAY), lastMfaAt: createdAt
  };
}

async function service(rows: Readonly<{ authenticate?: unknown; erasure?: unknown; list?: unknown }>, idleTtlMs?: number) {
  const calls: unknown[] = [];
  const v1 = sessionPolicyFromValue(SESSION_POLICY_REGISTER_ROW.value, SESSION_POLICY_REGISTER_ROW.sourceRef);
  const sessions = await SessionService.create({
    repository: {
      authenticateSession: async (input: unknown) => { calls.push(input); return rows.authenticate ?? null; },
      authenticateAccountErasureStatusSession: async () => rows.erasure ?? null,
      listActiveSessions: async () => rows.list ?? []
    } as never,
    riskSignals: {} as never, onRiskSignalFailure: () => undefined, dekStore: {} as never, argon2: {} as never,
    blindIndexKey: Buffer.alloc(32, 7), dummyPasswordHash: "fixture",
    authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS),
    mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),
    // The sealed v1 row: 14 days idle, 90 days absolute (optionally a longer idle, to exercise the clamp).
    sessionPolicy: idleTtlMs === undefined ? v1 : { ...v1, idleTtlMs },
    clock: () => now
  });
  return { sessions, calls };
}

describe("session lifetimes are clamped when a session is read", () => {
  it("refuses a v1 session older than 30 days although its stored absolute expiry is 90 days", async () => {
    const { sessions } = await service({ authenticate: record(ago(31), now) });
    expect(await sessions.authenticate(token(), source)).toBeNull();
  });

  it("refuses at exactly 30 days and accepts a session one minute younger", async () => {
    const atLimit = await service({ authenticate: record(ago(30), now) });
    expect(await atLimit.sessions.authenticate(token(), source)).toBeNull();
    const younger = await service({ authenticate: record(new Date(ago(30).getTime() + 60_000), now) });
    expect(await younger.sessions.authenticate(token(), source)).toMatchObject({ userId: "11111111-1111-4111-8111-111111111111" });
  });

  it("refuses a session last used more than 14 days ago", async () => {
    const { sessions } = await service({ authenticate: record(ago(20), ago(15)) });
    expect(await sessions.authenticate(token(), source)).toBeNull();
  });

  it("holds the erasure-status read to the same idle and absolute limits", async () => {
    const idle = await service({ erasure: record(ago(20), ago(15)) });
    expect(await idle.sessions.authenticateErasureStatus(token(), source)).toBeNull();
    const old = await service({ erasure: record(ago(45), ago(1)) });
    expect(await old.sessions.authenticateErasureStatus(token(), source)).toBeNull();
    const current = await service({ erasure: record(ago(10), ago(1)) });
    expect(await current.sessions.authenticateErasureStatus(token(), source)).not.toBeNull();
  });

  it("refreshes the idle expiry by at most 14 days even when the policy allows longer", async () => {
    const { sessions, calls } = await service({ authenticate: record(ago(1), now) }, 20 * DAY);
    expect(await sessions.authenticate(token(), source)).not.toBeNull();
    expect(calls).toEqual([expect.objectContaining({ idleExpiresAt: later(14) })]);
  });

  it("lists v1 sessions with their clamped expiry and leaves out the ones past it", async () => {
    const list = [
      { sessionId: "44444444-4444-4444-8444-444444444444", createdAt: ago(5), lastSeenAt: ago(1), idleExpiresAt: later(13), absoluteExpiresAt: later(85), lastMfaAt: ago(5) },
      { sessionId: "55555555-5555-4555-8555-555555555555", createdAt: ago(35), lastSeenAt: ago(1), idleExpiresAt: later(13), absoluteExpiresAt: later(55), lastMfaAt: ago(35) }
    ];
    const { sessions } = await service({ list });
    const authenticated = { session: { session_id: "44444444-4444-4444-8444-444444444444" }, userId: "11111111-1111-4111-8111-111111111111" };
    const listed = await sessions.listSessions(authenticated as never);
    expect(listed.map(row => row.session_id)).toEqual(["44444444-4444-4444-8444-444444444444"]);
    expect(listed[0]!.absolute_expires_at).toBe(later(25).toISOString());
  });
});
