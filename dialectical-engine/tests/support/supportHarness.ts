import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  SupportConfigurationState,
  SupportConfigurationValues
} from "../../packages/register/src/index.js";
import type {
  SupportApplication,
  SupportKnowledgeStatusPort
} from "../../apps/api/src/support/index.js";
import type {
  SupportMessageCipherPort,
  SupportMessagePlaintextRecord,
  SupportSessionPort,
  SupportSessionRecord
} from "../../apps/api/src/support/session.js";

/**
 * An in-process support application: every port is a spy over plain objects, so
 * the support routes can be exercised in `tests/unit` without Postgres. It
 * exists because the S2 package's route behaviour — admission, the `/status`
 * cache, the Origin rule, the source pseudonym — has to be provable in the gate
 * (`tests/unit` + `tests/architecture`), and the existing route suite is
 * database-backed.
 *
 * It models only what the routes read. Anything a test needs to vary is an
 * override; anything it does not is a fixed, obviously-fake value.
 */
export const SUPPORT_KB_VERSION = "a".repeat(64);

export const SUPPORT_TEST_CONFIGURATION: SupportConfigurationValues = Object.freeze({
  supportEnabled: true,
  supportModelRef: "development:test-relay",
  supportRelayConcurrency: 2,
  supportDailyCallCap: 500,
  supportLimitAnonMessages10m: 20,
  supportLimitAnonMessages24h: 100,
  supportLimitAnonSessions1h: 5,
  supportLimitSessionMessages: 40,
  supportLimitMessageCharacters: 2_000,
  supportLimitAccountMessages10m: 60,
  supportLimitAccountMessages24h: 300,
  supportQueueDepth: 10,
  supportLockAfterInjections: 3,
  supportIpCooldownMinutes: 60,
  supportRetentionPolicy: "keep",
  supportRetentionRatifiedBy: null
});

export function supportConfigurationState(
  overrides: Partial<SupportConfigurationValues> = {}
): SupportConfigurationState {
  return {
    kind: "AVAILABLE",
    snapshot: {
      supportRegisterVersion: "9007199254740992",
      schemaVersion: 1,
      recordedAt: new Date("2026-09-22T00:00:00.000Z"),
      supportSnapshotSha256: "b".repeat(64),
      fullSnapshotSha256: "c".repeat(64),
      values: Object.freeze({ ...SUPPORT_TEST_CONFIGURATION, ...overrides })
    }
  } as SupportConfigurationState;
}

export type SupportHarness = Readonly<{
  application: SupportApplication;
  /** Every session the fake repository holds, by its stored capability hash. */
  sessions: Map<string, SupportSessionRecord>;
  spies: Readonly<{
    create: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    admitIpSession: ReturnType<typeof vi.fn>;
    admitMessage: ReturnType<typeof vi.fn>;
    recordRateLimit: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    knowledgeStatus: ReturnType<typeof vi.fn>;
    configuration: ReturnType<typeof vi.fn>;
    sourcePseudonym: ReturnType<typeof vi.fn>;
  }>;
}>;

export function supportHarness(options: Readonly<{
  configuration?: () => SupportConfigurationState;
  clock?: () => Date;
  /** Defaults to a labelled, obviously-fake stand-in for the keyed pseudonym. */
  sourcePseudonym?: (value: string) => string;
  /** Composed only when a test needs the case routes to get past 503. */
  caseAccess?: SupportApplication["caseAccess"];
}> = {}): SupportHarness {
  const stored = new Map<string, SupportSessionRecord>();
  const state = options.configuration ?? (() => supportConfigurationState());
  const clock = options.clock ?? (() => new Date("2026-09-22T00:00:00.000Z"));
  const messages: SupportMessagePlaintextRecord[] = [];

  const create = vi.fn(async (input: Readonly<{
    sessionId: string;
    tokenSha256: string;
    identityOwnerRef: string | null;
    language: "en" | "ro";
    kbVersion: string;
    createdAt: Date;
  }>) => {
    const record: SupportSessionRecord = Object.freeze({
      sessionId: input.sessionId,
      identityOwnerRef: input.identityOwnerRef,
      language: input.language,
      state: "OPEN" as const,
      kbVersion: input.kbVersion,
      createdAt: input.createdAt,
      consentOwnContextAt: null,
      shreddedAt: null
    });
    stored.set(input.tokenSha256, record);
    return record;
  });

  const read = vi.fn(async (input: Readonly<{ sessionId: string;tokenSha256: string }>) => {
    const record = stored.get(input.tokenSha256);
    return record === undefined || record.sessionId !== input.sessionId ? null : record;
  });

  const admitIpSession = vi.fn(async () => "ADMITTED" as const);
  const admitMessage = vi.fn(async () => "ADMITTED" as const);
  const recordRateLimit = vi.fn(async () => undefined);
  const status = vi.fn(async () => Object.freeze({
    callsToday: 0,
    deflection7Days: null,
    deflection30Days: null,
    ratingResolution7Days: null,
    ratingResolution30Days: null,
    openSessions: 0,
    newCases: 0,
    relayState: "AVAILABLE" as const
  }));
  const knowledgeStatus = vi.fn(async () => Object.freeze({
    kbVersion: SUPPORT_KB_VERSION, shipped: 12, ignored: 1
  }));
  const configuration = vi.fn(async () => state());
  const sourcePseudonym = vi.fn(
    options.sourcePseudonym ?? ((value: string) => `keyed:${value}`)
  );

  const sessionPort = Object.freeze({
    create, read, admitIpSession, admitMessage, recordRateLimit, status
  }) as unknown as SupportSessionPort;

  const messagePort = Object.freeze({
    write: async (input: Parameters<SupportMessageCipherPort["write"]>[0]) => {
      const record = Object.freeze({ ...input, redacted: false });
      messages.push(record);
      return record;
    },
    writeAndTransit: async (
      input: Parameters<SupportMessageCipherPort["writeAndTransit"]>[0],
      transit: (redacted: string) => Promise<void>
    ) => {
      await transit(input.text);
      const record = Object.freeze({ ...input, redacted: false });
      messages.push(record);
      return record;
    },
    read: async () => null,
    listSession: async () => Object.freeze([...messages])
  }) as unknown as SupportMessageCipherPort;

  const knowledge: SupportKnowledgeStatusPort = Object.freeze({ status: knowledgeStatus });

  const application: SupportApplication = Object.freeze({
    configuration: Object.freeze({ current: configuration }),
    sessions: sessionPort,
    messages: messagePort,
    knowledge,
    sourcePseudonym,
    clock,
    ...(options.caseAccess === undefined ? {} : { caseAccess: options.caseAccess })
  });

  return Object.freeze({
    application,
    sessions: stored,
    spies: Object.freeze({
      create, read, admitIpSession, admitMessage, recordRateLimit, status,
      knowledgeStatus, configuration, sourcePseudonym
    })
  });
}

/** A UUID the support routes' resource-id mirror accepts. */
export function supportResourceId(): string {
  return randomUUID();
}
