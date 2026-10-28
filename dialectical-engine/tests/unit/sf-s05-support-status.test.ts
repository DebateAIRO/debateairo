import { describe, expect, it } from "vitest";
import { parseRegisterVersionText, type SupportConfigurationStatus } from "@debateai/register";
import {
  renderSupportStatus,
  type SupportStatusRepositoryPort
} from "../../apps/runner/src/support-status-cli.js";

const KEPT = "support conversations: none kept — the support chat keeps no conversation";
const status: NonNullable<SupportConfigurationStatus> = {
  supportRegisterVersion: parseRegisterVersionText("8"),
  schemaVersion: 1,
  baseRegisterVersion: parseRegisterVersionText("7"),
  publicationId: "11111111-1111-4111-8111-111111111111",
  requestSha256: "1".repeat(64),
  snapshotSha256: "2".repeat(64),
  supportSnapshotSha256: "3".repeat(64),
  changedKeys: ["support_enabled"],
  sourceRef: "V:test",
  recordedAt: new Date("2026-10-24T00:00:00.000Z"),
  configurationText: JSON.stringify([
    { row_key: "support_enabled", value_json_text: "true", source_ref: "V:test" },
    { row_key: "support_retention_policy", value_json_text: '"keep"', source_ref: "V:test" }
  ])
};
const support: SupportStatusRepositoryPort = {
  readStatus: async () => ({
    callsToday: 9, openSessions: 2, newCases: 1,
    kbVersion: "a".repeat(64), kbShipped: 24, kbIgnored: 0,
    relayState: "UNAVAILABLE", deflection7Days: 0.5,
    deflection30Days: 0.5, ratingResolution7Days: 0.5,
    ratingResolution30Days: 0.5
  })
};
const render = (readSupportStatus: () => Promise<SupportConfigurationStatus> = async () => status) =>
  renderSupportStatus({ registerStatus: { readSupportStatus }, support });

describe("S05 support status keeps no conversation figures", () => {
  it("prints register, row, cache and knowledge lines", async () => {
    const output = await render();
    expect(output).toBe([
      "REGISTER_VERSION: 7",
      "support register version: 8",
      "catalogue version: 1",
      "marker recorded_at: 2026-10-24T00:00:00.000Z",
      "base version: 7",
      "publication id: 11111111-1111-4111-8111-111111111111",
      "changed keys: support_enabled",
      "source ref: V:test",
      `support_snapshot_sha256: ${"3".repeat(64)}`,
      `snapshot_sha256: ${"2".repeat(64)}`,
      "support_enabled: true (V:test)",
      'support_retention_policy: "keep" (V:test)',
      "cache max age: 1000 ms",
      "refresh deadline: 1000 ms",
      `kb_version: ${"a".repeat(64)}`,
      "kb loaded: 24 shipped, 0 ignored",
      KEPT,
      ""
    ].join("\n"));
  });

  it("prints the no-conversation line exactly once and last", async () => {
    const output = await render();
    expect(output.split(KEPT)).toHaveLength(2);
    expect(output.endsWith(`${KEPT}\n`)).toBe(true);
  });

  it("prints no spend, case, relay, quality, retention or erasure figures", async () => {
    const output = await render();
    expect(output).not.toMatch(/(?:^|\n)(?:calls|input tokens|output tokens|cost|open sessions|new cases|relay|deflection|rating resolution|retention|retention actor|erasures):? /imu);
  });

  it.each([
    ["UNAVAILABLE", async (): Promise<SupportConfigurationStatus> => { throw new Error("offline"); }],
    ["UNINITIALIZED", async (): Promise<SupportConfigurationStatus> => null],
    ["INVALID", async (): Promise<SupportConfigurationStatus> => ({ ...status, configurationText: "not-json" })]
  ] as const)("prints only %s and the no-conversation line on an early return", async (kind, read) => {
    expect(await render(read)).toBe(`support configuration: ${kind}\n${KEPT}\n`);
  });
});
