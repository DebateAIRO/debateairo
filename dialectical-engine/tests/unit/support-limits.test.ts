import { describe,expect,it,vi } from "vitest";
import type {
  RegisterPublicationPort,SupportConfigurationPort,SupportConfigurationValues
} from "@debateai/register";
import {
  canonicalDecimal,canonicalRegisterJson,parseRegisterVersionText
} from "@debateai/register";
import { SUPPORT_CONFIG_CACHE_MAX_AGE_MS } from "../../packages/register/src/support-config.js";
import {
  SUPPORT_LIMIT_DEFAULTS,checkLimit,readLimits
} from "../../apps/api/src/support/limits.js";
import {
  parseSupportLimitsArguments,runSupportLimits
} from "../../apps/runner/src/support-limits-cli.js";
import { formatSpend } from "../../apps/runner/src/support-status-cli.js";

const VALUES: SupportConfigurationValues = Object.freeze({
  supportEnabled: true,supportModelRef: "development:claude-cli",
  supportRelayConcurrency: 2,supportDailyCallCap: 500,
  supportLimitAnonMessages10m: 20,supportLimitAnonMessages24h: 100,
  supportLimitAnonSessions1h: 5,supportLimitSessionMessages: 40,
  supportLimitMessageCharacters: 2000,supportLimitAccountMessages10m: 60,
  supportLimitAccountMessages24h: 300,supportQueueDepth: 10,
  supportLockAfterInjections: 3,supportIpCooldownMinutes: 60,
  supportRetentionPolicy: "keep",supportRetentionRatifiedBy: null
});

function configuration(values: SupportConfigurationValues = VALUES) {
  return {
    current: vi.fn(async () => ({
      kind: "AVAILABLE" as const,
      snapshot: {
        supportRegisterVersion: "1" as never,schemaVersion: 1 as const,
        recordedAt: new Date("2026-09-07T00:00:00.000Z"),
        supportSnapshotSha256: "a".repeat(64),fullSnapshotSha256: "b".repeat(64),values
      }
    }))
  } satisfies Pick<SupportConfigurationPort,"current">;
}

describe("SUP-06 V-owned limits", () => {
  it("reads exactly the twelve governed bounds and their ratified defaults", async () => {
    const limits = await readLimits(configuration());
    expect(limits).toEqual(SUPPORT_LIMIT_DEFAULTS);
    expect(Object.keys(limits)).toHaveLength(12);
    expect(SUPPORT_CONFIG_CACHE_MAX_AGE_MS).toBeLessThanOrEqual(5_000);
    expect(checkLimit(limits,"support_limit_anon_msgs_10m",19)).toBe(true);
    expect(checkLimit(limits,"support_limit_anon_msgs_10m",20)).toBe(false);
  });

  it("fails closed when the support register is unavailable", async () => {
    await expect(readLimits({
      current: async () => ({ kind: "DISABLED",code: "SUPPORT_CONFIG_UNINITIALIZED" })
    })).rejects.toMatchObject({ code: "SUPPORT_LIMITS_UNAVAILABLE" });
  });

  it("formats cost honestly and prints typed token counts only when reported", () => {
    expect(formatSpend({ period: "today",calls: 3 })).toEqual([
      "calls today: 3","cost today: UNKNOWN"
    ]);
    expect(formatSpend({
      period: "today",calls: 3,inputTokens: 120,outputTokens: 42,costUsd: 0.42
    })).toEqual([
      "calls today: 3","input tokens today: 120","output tokens today: 42","cost today: $0.42"
    ]);
    expect(formatSpend({ period: "last 7 days",calls: 9,costUsd: 0 })).toEqual([
      "calls last 7 days: 9","cost last 7 days: $0.00"
    ]);
  });

  it("parses every current mutable support value type", () => {
    expect(parseSupportLimitsArguments([
      "set","support_limit_anon_msgs_10m","3","--source-ref","V:test"
    ])).toMatchObject({ row: "support_limit_anon_msgs_10m",valueJsonText: "3" });
    expect(parseSupportLimitsArguments([
      "set","support_model_ref","development:none","--source-ref","V:test"
    ])).toMatchObject({ row: "support_model_ref",valueJsonText: '"development:none"' });
    expect(parseSupportLimitsArguments([
      "set","support_enabled","false","--source-ref","V:test"
    ])).toMatchObject({ row: "support_enabled",valueJsonText: "false" });
    expect(parseSupportLimitsArguments([
      "set","support_retention_ratified_by","null","--source-ref","V:test"
    ])).toMatchObject({ row: "support_retention_ratified_by",valueJsonText: "null" });
  });

  it("rejects outside-prefix, unknown, and non-numeric values with typed errors", () => {
    expect(() => parseSupportLimitsArguments([
      "set","riskTier","3","--source-ref","V:test"
    ])).toThrowError(expect.objectContaining({ code: "SUPPORT_LIMIT_ROW_FORBIDDEN" }));
    expect(() => parseSupportLimitsArguments([
      "set","support_unknown","3","--source-ref","V:test"
    ])).toThrowError(expect.objectContaining({ code: "SUPPORT_LIMIT_ROW_UNKNOWN" }));
    expect(() => parseSupportLimitsArguments([
      "set","support_limit_anon_msgs_10m","many","--source-ref","V:test"
    ])).toThrowError(expect.objectContaining({ code: "SUPPORT_LIMIT_VALUE_INVALID" }));
  });

  it("publishes one canonical row against the current support register", async () => {
    const publication = {
      readSupportStatus: vi.fn(async () => ({
        supportRegisterVersion: parseRegisterVersionText("8"),schemaVersion: 1,
        baseRegisterVersion: parseRegisterVersionText("7"),
        publicationId: "00000000-0000-4000-8000-000000000001",
        requestSha256: "a".repeat(64),snapshotSha256: "b".repeat(64),
        supportSnapshotSha256: "c".repeat(64),
        changedKeys: Object.freeze(["support_enabled"] as const),
        sourceRef: "V:old",recordedAt: new Date(),configurationText: "[]"
      })),
      publishSupport: vi.fn(async () => ({
        publicationId: "00000000-0000-4000-8000-000000000002",
        registerVersion: parseRegisterVersionText("9"),
        baseRegisterVersion: parseRegisterVersionText("7"),
        previousSupportRegisterVersion: parseRegisterVersionText("8"),
        publicationKind: "SUPPORT_CONFIGURATION" as const,rowCount: 1,
        requestSha256: "d".repeat(64),snapshotSha256: "e".repeat(64),
        supportSnapshotSha256: "f".repeat(64),
        changedKeys: Object.freeze(["support_queue_depth"] as const),
        sourceRef: "V:test",recordedAt: new Date()
      }))
    } satisfies Pick<RegisterPublicationPort,"readSupportStatus"|"publishSupport">;
    const output = await runSupportLimits({
      row: "support_queue_depth",valueJsonText: canonicalRegisterJson(canonicalDecimal("1")),
      sourceRef: "V:test",
      publicationId: "00000000-0000-4000-8000-000000000002",publication
    });
    expect(output.stdout).toContain("SUPPORT_CONFIG_PUBLISHED support_queue_depth=1");
    expect(publication.publishSupport).toHaveBeenCalledWith(expect.objectContaining({
      baseRegisterVersion: "7",expectedSupportRegisterVersion: "8",
      patch: [{ key: "support_queue_depth",valueJsonText: "1" }]
    }));
  });
});
