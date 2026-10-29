import { createHmac, randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { SupportConfigurationState, SupportConfigurationValues } from "../../packages/register/src/index.js";
import type { SupportApplication, SupportKnowledgeStatusPort } from "../../apps/api/src/support/index.js";
import { SupportMessageLimiter } from "../../apps/api/src/support/memory-limits.js";
import { SupportDegradedState } from "../../apps/api/src/support/degraded.js";

/** A stateless in-process composition for route tests without Postgres. */
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
      supportRegisterVersion: "9007199254740992", schemaVersion: 1,
      recordedAt: new Date("2026-09-22T00:00:00.000Z"),
      supportSnapshotSha256: "b".repeat(64), fullSnapshotSha256: "c".repeat(64),
      values: Object.freeze({ ...SUPPORT_TEST_CONFIGURATION, ...overrides })
    }
  } as SupportConfigurationState;
}
export type SupportHarness = Readonly<{
  application: SupportApplication;
  spies: Readonly<{
    knowledgeStatus: ReturnType<typeof vi.fn>;
    configuration: ReturnType<typeof vi.fn>;
    sourcePseudonym: ReturnType<typeof vi.fn>;
    answer: ReturnType<typeof vi.fn>;
  }>;
}>;
export function supportHarness(options: Readonly<{
  configuration?: () => SupportConfigurationState;
  clock?: () => Date;
  sourcePseudonym?: (value: string) => string;
  limiter?: SupportMessageLimiter;
  degraded?: SupportDegradedState;
}> = {}): SupportHarness {
  const configuration = vi.fn(async () => (options.configuration ?? supportConfigurationState)());
  const knowledgeStatus = vi.fn(async () => ({ kbVersion: SUPPORT_KB_VERSION, shipped: 12, ignored: 1 }));
  const sourcePseudonym = vi.fn(options.sourcePseudonym ?? ((value: string) =>
    createHmac("sha256", Buffer.alloc(32, 0x53)).update(value).digest("hex")));
  const answer = vi.fn(async () => ({
    outcome: "ANSWER_GROUNDED" as const, text: "test answer", canEscalate: true as const,
    sources: [], actions: []
  }));
  const knowledge: SupportKnowledgeStatusPort = {
    status: knowledgeStatus,
    snapshot: () => ({ kbVersion: SUPPORT_KB_VERSION, entries: [] }) as never
  };
  const application: SupportApplication = {
    configuration: { current: configuration }, knowledge,
    limiter: options.limiter ?? new SupportMessageLimiter(),
    degraded: options.degraded ?? new SupportDegradedState(),
    sourcePseudonym, answer: { respond: answer },
    clock: options.clock ?? (() => new Date("2026-09-22T00:00:00.000Z")),
    incidents: { readActiveIncidents: async () => [] }
  };
  return { application, spies: { configuration, knowledgeStatus, sourcePseudonym, answer } };
}
/** A UUID suitable for the legacy route inventory checks. */
export function supportResourceId(): string { return randomUUID(); }
