import { describe,expect,it,vi } from "vitest";
import {
  DEVELOPMENT_SUPPORT_CONFIGURATION,
  initializeDevelopmentSupportConfiguration
} from "../../apps/runner/src/dev-support-config.js";
import {
  SUPPORT_CONFIGURATION_KEYS,
  canonicalDecimal,
  canonicalRegisterJson,
  parseRegisterVersionText,
  type RegisterPublicationPort,
  type SupportConfigurationPublication,
  type SupportConfigurationStatus
} from "../../packages/register/src/index.js";

function status(overrides: Readonly<Record<string,unknown>> = {}): NonNullable<SupportConfigurationStatus> {
  const values = { ...DEVELOPMENT_SUPPORT_CONFIGURATION,...overrides };
  return Object.freeze({
    supportRegisterVersion: parseRegisterVersionText("9"),
    schemaVersion: 1,
    baseRegisterVersion: parseRegisterVersionText("4"),
    publicationId: "11111111-1111-4111-8111-111111111111",
    requestSha256: "a".repeat(64),snapshotSha256: "b".repeat(64),
    supportSnapshotSha256: "c".repeat(64),changedKeys: ["support_enabled"] as const,
    sourceRef: "test",recordedAt: new Date("2026-01-01T00:00:00.000Z"),
    configurationText: JSON.stringify(SUPPORT_CONFIGURATION_KEYS.map((key) => ({
      row_key: key,value_json_text: canonicalRegisterJson(
        typeof values[key] === "number" ? canonicalDecimal(String(values[key])) : values[key]
      ),source_ref: "test"
    })))
  });
}

function publication(current: SupportConfigurationStatus) {
  return Object.freeze({
    readSupportStatus: vi.fn(async () => current),
    publishSupport: vi.fn(async (input: SupportConfigurationPublication) => Object.freeze({
      registerVersion: parseRegisterVersionText("10"),
      baseRegisterVersion: input.baseRegisterVersion,
      publicationId: input.publicationId,publicationKind: "SUPPORT_CONFIGURATION" as const,
      requestSha256: "d".repeat(64),snapshotSha256: "e".repeat(64),rowCount: 16,
      recordedAt: new Date(),previousSupportRegisterVersion: input.expectedSupportRegisterVersion,
      supportSnapshotSha256: "f".repeat(64),changedKeys: input.patch.map((row) => row.key)
    }))
  }) satisfies Pick<RegisterPublicationPort,"readSupportStatus"|"publishSupport">;
}

describe("development Support Hermes configuration",() => {
  it("initializes every required row with Support enabled and Hermes GLM selected",async () => {
    const port = publication(null);
    await expect(initializeDevelopmentSupportConfiguration({
      publication: port,baseRegisterVersion: parseRegisterVersionText("4"),
      publicationId: () => "22222222-2222-4222-8222-222222222222"
    })).resolves.toBe("PUBLISHED");
    const input = port.publishSupport.mock.calls[0]![0];
    expect(input.expectedSupportRegisterVersion).toBeNull();
    expect(input.patch).toHaveLength(16);
    expect(Object.fromEntries(input.patch.map((row) => [row.key,row.valueJsonText]))).toMatchObject({
      support_enabled: "true",
      support_model_ref: '"development:hermes-glm-5.3-flash"'
    });
  });

  it("updates only binding rows and preserves existing tuned limits",async () => {
    const port = publication(status({
      support_enabled: false,
      support_model_ref: "development:claude-cli",
      support_daily_call_cap: 17
    }));
    await initializeDevelopmentSupportConfiguration({
      publication: port,baseRegisterVersion: parseRegisterVersionText("4"),
      publicationId: () => "22222222-2222-4222-8222-222222222222"
    });
    const input = port.publishSupport.mock.calls[0]![0];
    expect(input.baseRegisterVersion).toBe("9");
    expect(input.patch.map((row) => row.key)).toEqual(["support_enabled","support_model_ref"]);
    expect(JSON.stringify(input.patch)).not.toContain("support_daily_call_cap");
  });

  it("is idempotent when the Hermes binding is already active",async () => {
    const port = publication(status());
    await expect(initializeDevelopmentSupportConfiguration({
      publication: port,baseRegisterVersion: parseRegisterVersionText("4"),
      publicationId: () => "22222222-2222-4222-8222-222222222222"
    })).resolves.toBe("UNCHANGED");
    expect(port.publishSupport).not.toHaveBeenCalled();
  });
});
