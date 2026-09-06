import { describe, expect, it } from "vitest";
import type {
  RegisterPublicationPort,
  SupportConfigurationPublication,
  SupportConfigurationStatus,
  SupportPublicationReceipt
} from "../../packages/register/src/index.js";
import { parseRegisterVersionText } from "../../packages/register/src/index.js";
import { runSupportSwitch } from "../../apps/runner/src/support-switch-cli.js";
import {
  renderSupportStatus,
  type SupportStatusRepositoryPort
} from "../../apps/runner/src/support-status-cli.js";

const STATUS: NonNullable<SupportConfigurationStatus> = Object.freeze({
  supportRegisterVersion: parseRegisterVersionText("9007199254740992"),
  schemaVersion: 1,
  baseRegisterVersion: parseRegisterVersionText("4"),
  publicationId: "11111111-1111-4111-8111-111111111111",
  requestSha256: "1".repeat(64),
  snapshotSha256: "2".repeat(64),
  supportSnapshotSha256: "3".repeat(64),
  changedKeys: ["support_enabled"] as const,
  sourceRef: "deployment:test",
  recordedAt: new Date("2026-09-06T05:00:00.000Z"),
  configurationText: JSON.stringify([
    { row_key: "support_enabled", value_json_text: "true", source_ref: "deployment:test" },
    { row_key: "support_model_ref", value_json_text: "\"development:claude-cli\"", source_ref: "deployment:test" }
  ])
});

function publicationPort(published: SupportConfigurationPublication[]): RegisterPublicationPort {
  return {
    importHistorical: async () => { throw new TypeError("unused"); },
    publishGeneral: async () => { throw new TypeError("unused"); },
    readSupportStatus: async () => STATUS,
    publishSupport: async (input) => {
      published.push(input);
      return {
        registerVersion: parseRegisterVersionText("9007199254740993"),
        baseRegisterVersion: input.baseRegisterVersion,
        publicationId: input.publicationId,
        publicationKind: "SUPPORT_CONFIGURATION",
        requestSha256: "4".repeat(64),
        snapshotSha256: "5".repeat(64),
        rowCount: 16,
        recordedAt: new Date("2026-09-06T05:00:01.000Z"),
        previousSupportRegisterVersion: input.expectedSupportRegisterVersion,
        supportSnapshotSha256: "6".repeat(64),
        changedKeys: ["support_enabled"] as const
      } satisfies SupportPublicationReceipt;
    }
  };
}

describe("SUP-01 support control CLIs", () => {
  it("publishes a one-key support switch patch through the closed publication port", async () => {
    const published: SupportConfigurationPublication[] = [];
    const result = await runSupportSwitch({
      desired: false,
      sourceRef: "deployment:support-off:test",
      publicationId: "22222222-2222-4222-8222-222222222222",
      publication: publicationPort(published),
      acknowledgedAt: () => new Date("2026-09-06T05:00:02.000Z")
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SUPPORT_CONFIG_PUBLISHED");
    expect(result.stdout).toContain("register_version=9007199254740993");
    expect(result.stdout).toContain("commit_acknowledged_at=2026-09-06T05:00:02.000Z");
    expect(published).toEqual([{
      publicationId: "22222222-2222-4222-8222-222222222222",
      baseRegisterVersion: "4",
      expectedSupportRegisterVersion: "9007199254740992",
      schemaVersion: 1,
      patch: [{ key: "support_enabled", valueJsonText: "false" }],
      sourceRef: "deployment:support-off:test"
    }]);
  });

  it("reports a no-op without publishing", async () => {
    const published: SupportConfigurationPublication[] = [];
    const result = await runSupportSwitch({
      desired: true,
      sourceRef: "deployment:support-on:test",
      publicationId: "22222222-2222-4222-8222-222222222222",
      publication: publicationPort(published)
    });
    expect(result).toEqual({ exitCode: 0, stdout: "SUPPORT_CONFIG_UNCHANGED support_enabled=true\n" });
    expect(published).toEqual([]);
  });

  it("combines register status and support-repository counts without leaking credentials or identities", async () => {
    const support: SupportStatusRepositoryPort = {
      readStatus: async () => ({
        callsToday: 7,
        openSessions: 3,
        newCases: 2,
        kbVersion: "a".repeat(64),
        kbShipped: 12,
        kbIgnored: 1,
        relayState: "AVAILABLE"
      })
    };
    const output = await renderSupportStatus({
      registerStatus: { readSupportStatus: async () => STATUS },
      support
    });
    expect(output).toContain("REGISTER_VERSION: 4");
    expect(output).toContain("support register version: 9007199254740992");
    expect(output).toContain("support_enabled: true (deployment:test)");
    expect(output).toContain("calls today: 7");
    expect(output).toContain(`kb_version: ${"a".repeat(64)}`);
    expect(output).toContain("kb loaded: 12 shipped, 1 ignored");
    expect(output).toContain("relay state: AVAILABLE");
    expect(output).not.toMatch(/(?:databaseUrl|password|token|identity|transcript)/iu);
  });
});
